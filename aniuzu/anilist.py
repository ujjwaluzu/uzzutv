"""
AniList GraphQL API service for Aniuzu.

All anime metadata comes from the official public endpoint:
    POST https://graphql.anilist.co  with {"query": ..., "variables": ...}

No scraping, no private keys. Responses are cached server-side so we do not
hammer AniList on every request. Transient network/API failures surface as
AniListError so callers can render fallback states instead of crashing.
"""

import re
import html as html_lib

import requests
from django.conf import settings
from django.core.cache import cache

LIST_CACHE_TIMEOUT = 60 * 10        # 10 minutes for homepage/browse sections
DETAIL_CACHE_TIMEOUT = 60 * 60 * 6  # 6 hours for individual anime pages
REQUEST_TIMEOUT = 15                # seconds


def _api_url():
    # Read at call time so environment/config overrides always take effect.
    return getattr(settings, "ANILIST_API_URL", "https://graphql.anilist.co")


class AniListError(Exception):
    """Transient failure (network down, rate limit, AniList outage)."""


class AnimeNotFound(AniListError):
    """AniList has no anime with the requested ID."""


# ------------------------------------------------------------------
# GraphQL field fragments (only fields Aniuzu actually renders)
# ------------------------------------------------------------------

CARD_FIELDS = """
  id
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  format
  status
  season
  seasonYear
  averageScore
  episodes
  genres
"""

DETAIL_FIELDS = CARD_FIELDS + """
  description(asHtml: false)
  duration
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode }
"""


def _page_query(sort, extra_filters=""):
    return """
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    media(type: ANIME, isAdult: false, %s%s) {
      %s
    }
  }
}
""" % (extra_filters, (" " + sort) if sort else "", CARD_FIELDS)


QUERIES = {
    "trending": _page_query("sort: TRENDING_DESC"),
    "popular": _page_query("sort: POPULARITY_DESC"),
    "airing": _page_query("sort: POPULARITY_DESC", "status: RELEASING,"),
    "search": """
query ($page: Int, $perPage: Int, $search: String) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    media(type: ANIME, isAdult: false, search: $search, sort: SEARCH_MATCH) {
      %s
    }
  }
}
""" % CARD_FIELDS,
    "detail": """
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    %s
  }
}
""" % DETAIL_FIELDS,
}


# ------------------------------------------------------------------
# Core request helper
# ------------------------------------------------------------------

def _run_query(query_key, variables):
    """POST a named query to AniList. Returns parsed data or raises."""
    try:
        response = requests.post(
            _api_url(),
            json={"query": QUERIES[query_key], "variables": variables},
            timeout=REQUEST_TIMEOUT,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        if response.status_code == 404:
            # AniList signals unknown Media IDs with a plain HTTP 404.
            raise AnimeNotFound
        response.raise_for_status()
        payload = response.json()
    except AnimeNotFound:
        raise
    except (requests.RequestException, ValueError) as exc:
        raise AniListError(str(exc)) from exc

    errors = payload.get("errors")
    if errors:
        if any(err.get("status") == 404 for err in errors):
            raise AnimeNotFound
        raise AniListError(errors[0].get("message", "AniList query failed"))

    return payload.get("data")


# ------------------------------------------------------------------
# Public helpers (each returns plain dicts / lists / None)
# ------------------------------------------------------------------

def fetch_media_list(query_key, page=1, per_page=20, search=None):
    """Fetch a page of anime cards for trending/popular/airing/search."""
    cache_key = f"aniuzu:{query_key}:{search or ''}:{page}:{per_page}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    variables = {"page": page, "perPage": per_page}
    if search is not None:
        variables["search"] = search

    try:
        data = _run_query(query_key, variables)
    except AniListError:
        return None  # caller renders a fallback state; nothing cached

    result = data.get("Page") or {}
    output = {"media": result.get("media") or [], "page_info": result.get("pageInfo") or {}}

    cache.set(cache_key, output, LIST_CACHE_TIMEOUT)
    return output


def trending_anime(page=1, per_page=20):
    return fetch_media_list("trending", page=page, per_page=per_page)


def popular_anime(page=1, per_page=20):
    return fetch_media_list("popular", page=page, per_page=per_page)


def airing_anime(page=1, per_page=20):
    return fetch_media_list("airing", page=page, per_page=per_page)


def search_anime(query, page=1, per_page=24):
    query = (query or "").strip()
    if not query:
        return {"media": [], "page_info": {}}
    return fetch_media_list("search", page=page, per_page=per_page, search=query)


def get_anime(anilist_id):
    """Fetch one anime's full details by AniList ID.

    Raises AnimeNotFound for unknown IDs; returns None on transient failure.
    """
    anilist_id = int(anilist_id)
    cache_key = f"aniuzu:media:{anilist_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    data = _run_query("detail", {"id": anilist_id})
    media = (data or {}).get("Media")

    if media:
        cache.set(cache_key, media, DETAIL_CACHE_TIMEOUT)
    return media


# ------------------------------------------------------------------
# Text helpers used by templates/views
# ------------------------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")


def clean_description(text, limit=None):
    """Strip AniList HTML markup and optionally truncate to whole words."""
    if not text:
        return ""
    text = html_lib.unescape(_TAG_RE.sub(" ", str(text)))
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        cut = text[:limit].rsplit(" ", 1)[0]
        text = cut.rstrip(",;:-") + "…"
    return text
