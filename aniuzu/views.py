from django.conf import settings
from django.http import Http404
from django.shortcuts import render

from . import anilist, anikoto, providers


SECTIONS = {
    "trending": anilist.trending_anime,
    "popular": anilist.popular_anime,
    "airing": anilist.airing_anime,
}

SECTION_TITLES = {
    "trending": "Trending Anime",
    "popular": "All-Time Popular",
    "airing": "Currently Airing",
}


def _safe_page_number(request):
    try:
        page = int(request.GET.get("page", 1))
    except (TypeError, ValueError):
        return 1
    return page if page >= 1 else 1


def _section(data):
    """Normalize an API list result for the row include."""
    return {
        "items": (data or {}).get("media") or [],
        "api_error": data is None,
    }


def home(request):
    trending = anilist.trending_anime(per_page=20)
    popular = anilist.popular_anime(per_page=12)
    airing = anilist.airing_anime(per_page=12)

    hero = None
    if trending:
        media = trending.get("media") or []
        hero = next((m for m in media if m.get("bannerImage")), media[0] if media else None)
        if hero:
            hero["short_description"] = anilist.clean_description(hero.get("description"), 220)

    return render(request, "aniuzu/home.html", {
        "hero": hero,
        "trending": _section(trending),
        "popular": _section(popular),
        "airing": _section(airing),
    })


def browse(request, section):
    if section not in SECTIONS:
        raise Http404

    page = _safe_page_number(request)
    data = SECTIONS[section](page=page, per_page=24)

    page_info = (data or {}).get("page_info") or {}
    context = {
        "section": section,
        "section_title": SECTION_TITLES[section],
        "anime_list": (data or {}).get("media") or [],
        "api_error": data is None,
        "has_previous": bool(page_info.get("current", 1) > 1),
        "has_next": bool(page_info.get("hasNextPage")),
        "previous_page": page - 1,
        "next_page": page + 1,
        "current_page": page,
    }
    return render(request, "aniuzu/browse.html", context)


def search(request):
    query = request.GET.get("q", "").strip()
    results = None
    api_error = False

    if query:
        results = anilist.search_anime(query)
        api_error = results is None
        if results is not None:
            results = results.get("media") or []

    return render(request, "aniuzu/search.html", {
        "query": query,
        "results": results,
        "api_error": api_error,
    })


# ----------------------------------------------------------------------
# Anikoto episode plumbing (server-side only)
# ----------------------------------------------------------------------

def _episode_browser_payload(series):
    """Slim per-episode records embedded into pages for the JS browser.

    Numbers keep Anikoto's values (specials/gaps preserved); sub/dub flags
    reflect actual embed availability. URLs stay server-side here — the
    detail page never needs them.
    """
    episodes = []
    for episode in series["episodes"]:
        episodes.append({
            "n": episode["number"],
            "s": 1 if episode["subUrl"] else 0,
            "d": 1 if episode["dubUrl"] else 0,
        })
    return {
        "count": len(episodes),
        "subAvailable": any(e["s"] for e in episodes),
        "dubAvailable": any(e["d"] for e in episodes),
        "episodes": episodes,
    }


def _resolve_episode(series, wanted_number):
    """Exact Anikoto episode by number, else the next one above it.

    Returns (index, episode_record) or (None, None). Never invents an
    episode: what plays always comes from Anikoto's own list.
    """
    episodes = series["episodes"]
    for index, episode in enumerate(episodes):
        if episode["number"] == wanted_number:
            return index, episode
    # Exact misses fall forward (fractional specials like 5.5 sit between
    # integers); anything past the end simply doesn't exist yet.
    for index, episode in enumerate(episodes):
        if episode["number"] is not None and episode["number"] > wanted_number:
            return index, episode
    return None, None


def _watch_context_payload(anilist_id, series_id, series, index, language):
    """JSON snapshot the watch page JS needs — everything pre-decided
    server-side so the client never constructs playback URLs."""
    episodes = series["episodes"]
    current = episodes[index]
    previous = episodes[index - 1] if index > 0 else None
    following = episodes[index + 1] if index < len(episodes) - 1 else None

    available = []
    if current["subUrl"]:
        available.append("sub")
    if current["dubUrl"]:
        available.append("dub")

    return {
        "debug": bool(getattr(settings, "DEBUG", False)),
        "anilistId": anilist_id,
        "anikotoSeriesId": series_id,
        "anikotoEpisodeId": current["id"],
        "embedId": current["embedId"],
        "episodeNumber": str(current["number"]),
        "language": providers.closest_language(language, available),
        "availableLanguages": available,
        "playerUrls": {"sub": current["subUrl"], "dub": current["dubUrl"]},
        "prevNumber": str(previous["number"]) if previous else None,
        "nextNumber": str(following["number"]) if following else None,
        "totalEpisodes": len(episodes),
        # Origins the watch page may receive player postMessages from.
        "allowedOrigins": providers.ALLOWED_ORIGINS,
        "episodes": [
            {
                "n": item["number"],
                "id": item["id"],          # Anikoto episode record id
                "embed": item["embedId"],  # MegaPlay embed id
                "sub": item["subUrl"],
                "dub": item["dubUrl"],
            }
            for item in episodes
        ],
    }


def detail(request, anime_id):
    try:
        anime = anilist.get_anime(anime_id)
    except anilist.AnimeNotFound:
        raise Http404("Anime not found")
    except anilist.AniListError:
        anime = None  # transient AniList failure -> render fallback state

    anime_id = int(anime_id)

    # Episodes come from Anikoto; AniList metadata failure must not block it.
    series_id, series = anikoto.get_series_for_anilist(anime_id)
    anikoto_error = series_id is not None and series is None  # mapped but fetch failed

    return render(request, "aniuzu/detail.html", {
        "anime": anime,
        "api_error": anime is None,
        "anime_id": anime_id,
        "series_id": series_id,
        "series": series,
        "anikoto_error": anikoto_error,
        "browser_data": _episode_browser_payload(series) if series else None,
    })


def watch(request, anime_id, episode):
    try:
        wanted = max(1, int(episode))
    except (TypeError, ValueError):
        raise Http404("Invalid episode")

    anime_id = int(anime_id)

    try:
        anime = anilist.get_anime(anime_id)
    except anilist.AniListError:
        anime = None  # degrade gracefully; Anikoto still drives playback
    except anilist.AnimeNotFound:
        raise Http404("Anime not found")

    series_id, series = anikoto.get_series_for_anilist(anime_id)

    index, current = (None, None)
    if series:
        index, current = _resolve_episode(series, wanted)

    language = request.GET.get("lang")
    payload = None
    if series and current:
        payload = _watch_context_payload(anime_id, series_id, series, index, language)

    # AniList metadata first; Anikoto title covers transient AniList
    # failures so the page stays usable when one provider is down.
    display_title = ""
    if anime:
        display_title = (anime.get("title") or {}).get("english") \
            or (anime.get("title") or {}).get("romaji") \
            or (anime.get("title") or {}).get("native") or ""
    if not display_title and series:
        display_title = series.get("title") or ""

    return render(request, "aniuzu/watch.html", {
        "anime": anime,
        "anime_id": anime_id,
        "api_error": anime is None and series is None,
        "series": series,
        "series_id": series_id,
        "current_episode": current,
        "wanted_episode": wanted,
        "display_title": display_title,
        "anikoto_error": series_id is not None and series is None,
        "watch_data": payload,
    })
