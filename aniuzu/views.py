from django.http import Http404
from django.shortcuts import render

from . import anilist


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
    })
