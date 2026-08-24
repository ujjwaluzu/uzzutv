"""
Anikoto API service for Aniuzu — the episode source of truth.

AniList owns *metadata* (titles, art, synopsis, scores). Anikoto owns
*episodes*. These are two independent ID spaces:

    AniList "One Piece"  ->  id 21
    Anikoto "One Piece"  ->  id 1642

so an AniList ID is NEVER trusted as an Anikoto ID. Mapping is resolved in
this order (see resolve_series_id):

    1. cached mapping (`anikoto:map:{anilist_id}`)
    2. verified direct probe: GET /series/{anilist_id} is accepted ONLY if
       the returned anime.ani_id equals the requested AniList ID
    3. catalog index built from /recent-anime, whose rows carry `ani_id`
       (the AniList ID) and `mal_id`

Every HTTP call happens server-side (the Anikoto docs require it) and all
results are cached in Django's default cache (database-backed here). No
Redis, no extra packages.
"""

import re

import requests
from django.conf import settings
from django.core.cache import cache

LIST_CACHE_TIMEOUT = 60 * 10           # /recent-anime pages
SERIES_CACHE_TIMEOUT = 60 * 60 * 2     # full episode catalog per series
MAP_CACHE_TIMEOUT = 60 * 60 * 24 * 7   # anilist id -> anikoto id mapping
NEGATIVE_MAP_TIMEOUT = 60 * 30         # "no mapping found" marker
INDEX_CACHE_TIMEOUT = 60 * 60 * 12     # catalog index + scan cursor
REQUEST_TIMEOUT = 15                   # seconds
CATALOG_PER_PAGE = 100                 # rows scanned per indexed page
SCAN_PAGES_PER_MISS = 8                # catalog pages advanced per unmapped request


class AnikotoError(Exception):
    """Transient failure (network down, rate limit, Anikoto outage)."""


class SeriesNotFound(AnikotoError):
    """Anikoto has no series with the requested ID."""


class RateLimited(AnikotoError):
    """Anikoto answered 429; back off before retrying.

    Carries `retry_after` (seconds) parsed from the Retry-After header
    when Anikoto sends one — shared hosting IPs need to actually wait.
    """

    def __init__(self, retry_after=0):
        super().__init__(f"rate limited (Retry-After={retry_after}s)")
        self.retry_after = int(retry_after or 0)


def _api_url():
    return getattr(settings, "ANIKOTO_API_URL", "https://anikotoapi.site").rstrip("/")


def _timeout():
    return getattr(settings, "ANIKOTO_TIMEOUT", REQUEST_TIMEOUT)


# Cloudflare-fronted APIs commonly reject the default python-requests
# user agent outright — shared-hosting egress IPs get no benefit of the
# doubt. Identifying as a normal browser keeps the door open.
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def _user_agent():
    return getattr(settings, "ANIKOTO_USER_AGENT", DEFAULT_USER_AGENT)


def _retry_after(response):
    """Seconds from a Retry-After header (0 when absent/unparseable)."""
    raw = response.headers.get("Retry-After") if response is not None else None
    try:
        return max(0, int(float(raw)))
    except (TypeError, ValueError):
        return 0


def _get(path, params=None):
    """GET {base}/{path}. Returns parsed JSON or raises."""
    try:
        response = requests.get(
            f"{_api_url()}/{path.lstrip('/')}",
            params=params,
            timeout=_timeout(),
            headers={"Accept": "application/json", "User-Agent": _user_agent()},
        )
        if response.status_code == 404:
            raise SeriesNotFound
        if response.status_code == 429:
            raise RateLimited(_retry_after(response))
        response.raise_for_status()
        payload = response.json()
    except (SeriesNotFound, RateLimited):
        raise
    except (requests.RequestException, ValueError) as exc:
        raise AnikotoError(str(exc)) from exc

    if not isinstance(payload, dict) or payload.get("ok") is not True:
        raise AnikotoError("Malformed Anikoto response")
    return payload


# ----------------------------------------------------------------------
# Response normalization
# ----------------------------------------------------------------------

_URL_RE = re.compile(r"^https?://\S+$")


def _clean_url(url):
    url = (url or "").strip()
    return url if _URL_RE.match(url) else None


def _episode_number(value):
    """Episode numbers may arrive as ints, floats ('5.5') or numeric strings."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < 0:
        return None
    return int(number) if float(number).is_integer() else round(number, 2)


def normalize_series(data):
    """Shape a raw /series/{id} `data` payload into what Aniuzu needs.

    Episodes are kept in Anikoto's own order (that order drives prev/next).
    SUB/DUB availability comes strictly from which embed URLs Anikoto
    actually returned — a language without an embed is never offered, so
    no URL is ever invented for a track that does not exist.
    """
    if not isinstance(data, dict):
        raise AnikotoError("Malformed Anikoto series payload")

    anime = data.get("anime") or {}
    raw_episodes = data.get("episodes")
    if not isinstance(raw_episodes, list):
        raise AnikotoError("Malformed Anikoto episode list")

    episodes = []
    for raw in raw_episodes:
        if not isinstance(raw, dict):
            continue
        embed_id = str(raw.get("episode_embed_id") or "").strip()
        if not embed_id:
            continue  # unplayable record — nothing to build a player from
        embeds = raw.get("embed_url") or {}
        sub_url = _clean_url(embeds.get("sub"))
        dub_url = _clean_url(embeds.get("dub"))
        if not sub_url and not dub_url:
            continue
        episodes.append({
            "id": raw.get("id"),
            "number": _episode_number(raw.get("number")),
            "embedId": embed_id,
            "title": (raw.get("title") or "").strip(),
            "subUrl": sub_url,
            "dubUrl": dub_url,
        })

    if not episodes:
        raise AnikotoError("Anikoto series has no playable episodes")

    return {
        "seriesId": anime.get("id"),
        "anilistId": str(anime.get("ani_id") or "").strip(),
        "malId": str(anime.get("mal_id") or "").strip(),
        "title": (anime.get("title") or "").strip(),
        "isSub": any(e["subUrl"] for e in episodes),
        "isDub": any(e["dubUrl"] for e in episodes),
        "episodes": episodes,
    }


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------

def recent_anime(page=1, per_page=20):
    """Cached page of recent catalog rows (used by the mapping indexer)."""
    page = max(1, int(page))
    per_page = min(100, max(1, int(per_page)))
    cache_key = f"anikoto:recent:{page}:{per_page}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    payload = _get("recent-anime", {"page": page, "per_page": per_page})
    rows = payload.get("data") or []
    output = {
        "rows": [
            row for row in rows
            if isinstance(row, dict) and str(row.get("ani_id") or "").strip()
        ],
        "pagination": payload.get("pagination") or {},
    }
    cache.set(cache_key, output, LIST_CACHE_TIMEOUT)
    return output


def get_series(anikoto_id):
    """Fetch + normalize one series' complete episode catalog (cached)."""
    try:
        anikoto_id = int(anikoto_id)
    except (TypeError, ValueError):
        raise SeriesNotFound("Invalid Anikoto series id")

    cache_key = f"anikoto:series:{anikoto_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        if cached == "__not_found__":
            raise SeriesNotFound
        return cached

    try:
        payload = _get(f"series/{anikoto_id}")
    except SeriesNotFound:
        cache.set(cache_key, "__not_found__", NEGATIVE_MAP_TIMEOUT)
        raise

    series = normalize_series(payload.get("data"))
    cache.set(cache_key, series, SERIES_CACHE_TIMEOUT)
    return series


# ----------------------------------------------------------------------
# Catalog index — ani_id -> anikoto series id, built from /recent-anime
# ----------------------------------------------------------------------

_INDEX_KEY = "aniuzu:anikoto:index"


def _index_state():
    state = cache.get(_INDEX_KEY)
    if isinstance(state, dict) and isinstance(state.get("by_ani"), dict):
        state.setdefault("cursor", 1)
        state.setdefault("exhausted", False)
        return state
    return {"by_ani": {}, "cursor": 1, "exhausted": False}


def _entry_from_row(row):
    ani_id = str(row.get("ani_id") or "").strip()
    series_id = row.get("id")
    if not ani_id or series_id is None:
        return None
    return {
        "seriesId": series_id,
        "aniId": ani_id,
        "malId": str(row.get("mal_id") or "").strip(),
        "title": (row.get("title") or "").strip(),
    }


def scan_catalog(max_pages=SCAN_PAGES_PER_MISS):
    """Advance the catalog index by up to `max_pages` pages of /recent-anime.

    The accumulated ani_id -> entry map plus a cursor are cached, so scans
    resume where they stopped instead of restarting. Rate limits keep any
    progress made so far.

    Returns (exhausted, stop_reason):
      "done"                    — pass finished without provider trouble
                                  (exhausted says whether the whole catalog
                                  has been consumed)
      "rate-limited:<seconds>"  — Anikoto answered 429; value is the parsed
                                  Retry-After hint
      "unreachable:<detail>"    — network/API/malformed-response failure
    """
    state = _index_state()
    cursor = int(state["cursor"])
    exhausted = bool(state["exhausted"])
    stop_reason = "done"

    scanned = 0
    while scanned < max_pages and not exhausted:
        try:
            page = recent_anime(page=cursor, per_page=CATALOG_PER_PAGE)
        except RateLimited as exc:
            stop_reason = f"rate-limited:{exc.retry_after}"
            break
        except AnikotoError as exc:
            stop_reason = f"unreachable:{str(exc)[:120] or 'unknown'}"
            break

        rows = page.get("rows") or []
        for row in rows:
            entry = _entry_from_row(row)
            if entry:
                state["by_ani"][entry["aniId"]] = entry

        pagination = page.get("pagination") or {}
        total_pages = pagination.get("total_pages")
        scanned += 1
        if total_pages:
            try:
                exhausted = cursor >= int(total_pages)
            except (TypeError, ValueError):
                exhausted = False
        elif not rows:
            exhausted = True
        if not exhausted and rows:
            cursor += 1

    state["cursor"] = cursor
    state["exhausted"] = exhausted
    cache.set(_INDEX_KEY, state, INDEX_CACHE_TIMEOUT)
    return exhausted, stop_reason


def lookup_in_index(anilist_id):
    """Catalog entry whose aniId matches, advancing the scan until found.

    Scanning stops early when the provider itself is misbehaving (rate
    limit / unreachable) — hammering a failing API from a request path
    helps nobody; the next request resumes from the cached cursor.
    """
    target = str(anilist_id).strip()

    def find():
        return _index_state()["by_ani"].get(target)

    hit = find()
    guard = 0
    while hit is None and guard < 200:
        if _index_state()["exhausted"]:
            break
        _, reason = scan_catalog()
        hit = find()
        if hit is not None or reason != "done":
            break
        guard += 1
    return hit


# ----------------------------------------------------------------------
# AniList -> Anikoto mapping
# ----------------------------------------------------------------------

def map_cache_key(anilist_id):
    return f"anikoto:map:{int(anilist_id)}"


def resolve_series_id(anilist_id):
    """Anikoto series ID for an AniList ID, or None when unknown.

    Order: cached mapping -> verified direct probe -> catalog index. A
    direct probe of /series/{anilist_id} is only believed when the response
    itself confirms ani_id == requested AniList ID.
    """
    try:
        anilist_id = int(anilist_id)
    except (TypeError, ValueError):
        return None
    key = str(anilist_id)

    cached = cache.get(map_cache_key(anilist_id))
    if cached == "__none__":
        return None
    if isinstance(cached, int):
        return cached

    # 1) Verified direct probe — cheap when IDs happen to coincide.
    try:
        series = get_series(anilist_id)
    except SeriesNotFound:
        series = None
    except AnikotoError:
        series = None
    if series and series.get("anilistId") == key:
        _cache_mapping(anilist_id, series["seriesId"])
        return series["seriesId"]

    # 2) Catalog index (lazy, resumable scan).
    try:
        entry = lookup_in_index(key)
    except AnikotoError:
        entry = None
    if entry:
        _cache_mapping(anilist_id, entry["seriesId"])
        return entry["seriesId"]

    cache.set(map_cache_key(anilist_id), "__none__", NEGATIVE_MAP_TIMEOUT)
    return None


def _cache_mapping(anilist_id, series_id):
    try:
        cache.set(map_cache_key(anilist_id), int(series_id), MAP_CACHE_TIMEOUT)
    except (TypeError, ValueError):
        pass


# ----------------------------------------------------------------------
# Convenience facade used by views
# ----------------------------------------------------------------------

def get_series_for_anilist(anilist_id):
    """(series_id, normalized_series | None).

    Never raises: provider failures degrade to (None, None) so pages stay
    usable without Anikoto. The negative result is cached briefly to avoid
    hammering the API on every request for titles it does not carry.
    """
    series_id = resolve_series_id(anilist_id)
    if series_id is None:
        return None, None
    try:
        return series_id, get_series(series_id)
    except AnikotoError:
        return series_id, None
