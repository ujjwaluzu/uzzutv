from django.conf import settings
from django.http import Http404
from django.shortcuts import render

from . import anilist, providers


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


def episode_total(anime):
    """Best-known episode count, without inventing metadata.

    Prefers AniList's `episodes`; for ongoing shows falls back to the
    number of episodes already aired. Returns None when unknown.
    """
    if not anime:
        return None
    count = anime.get("episodes")
    if count:
        return int(count)
    next_airing = anime.get("nextAiringEpisode") or {}
    airing = next_airing.get("episode")
    if airing and airing > 1:
        return int(airing) - 1
    return None


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


def detail(request, anime_id):
    try:
        anime = anilist.get_anime(anime_id)
    except anilist.AnimeNotFound:
        raise Http404("Anime not found")
    except anilist.AniListError:
        anime = None  # transient AniList failure -> render fallback state

    api_error = anime is None
    if anime:
        anime["clean_description"] = anilist.clean_description(anime.get("description"))

    return render(request, "aniuzu/detail.html", {
        "anime": anime,
        "api_error": api_error,
        "anime_id": int(anime_id),
        "episode_total": episode_total(anime),
        "episode_range": episode_range(anime),
    })


def episode_range(anime):
    """1..N for the detail page's quick-pick strip (empty when unknown)."""
    total = episode_total(anime)
    return range(1, total + 1) if total else []


def watch(request, anime_id, episode):
    try:
        episode = max(1, int(episode))
    except (TypeError, ValueError):
        raise Http404("Invalid episode")

    try:
        anime = anilist.get_anime(anime_id)
    except anilist.AnimeNotFound:
        raise Http404("Anime not found")
    except anilist.AniListError:
        anime = None  # transient AniList failure -> render fallback state

    anime_id = int(anime_id)
    total = episode_total(anime)

    watch_data = {
        "anilistId": anime_id,
        "episode": episode,
        "totalEpisodes": total,
        "debug": bool(getattr(settings, "DEBUG", False)),
        "defaultProvider": providers.DEFAULT_PROVIDER,
        "defaultLanguage": providers.DEFAULT_LANGUAGE,
        "providers": providers.client_config(),
    }

    return render(request, "aniuzu/watch.html", {
        "anime": anime,
        "anime_id": anime_id,
        "episode": episode,
        "episode_total": total,
        "api_error": anime is None,
        "watch_data": watch_data,
    })
