from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.core.cache import cache
import requests
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("TMDB_KEY")
BASE_URL = "https://api.themoviedb.org/3"

from django.shortcuts import render, redirect
from django.http import Http404

def auth(request):
    return render(request, "uzzutv/auth.html")


def profile(request):
    return render(request, "uzzutv/profile.html")


def public_profile(request, user_id):
    """Public profile page for any user, identified by their auth UUID."""

    return render(request, "uzzutv/public_profile.html", {"user_id": user_id})


def media_info(request, type, id):
    """Cached TMDB title/poster lookup used by the profile page."""

    if type not in ("movie", "tv"):
        return HttpResponse("Invalid type", status=400)

    cache_key = f"media_info_v2_{type}_{id}"
    info = cache.get(cache_key)

    if info:
        return JsonResponse(info)

    params = {"api_key": API_KEY}

    response = requests.get(
        f"{BASE_URL}/{type}/{id}",
        params=params,
        timeout=10
    )

    if response.status_code != 200:
        return HttpResponse("Not found", status=404)

    data = response.json()

    info = {
        "id": data.get("id"),
        "type": type,
        "title": data.get("title") or data.get("name", ""),
        "poster_path": data.get("poster_path", ""),
        "imdb_id": ""
    }

    external = requests.get(
        f"{BASE_URL}/{type}/{id}/external_ids",
        params=params,
        timeout=10
    )

    if external.status_code == 200:
        info["imdb_id"] = external.json().get("imdb_id", "") or ""

    cache.set(cache_key, info, 43200)  # 12 hours

    return JsonResponse(info)


def load_homepage_data():

    cache_key = "homepage_data"
    data = cache.get(cache_key)

    if data:
        return data

    params = {"api_key": API_KEY}

    trending_movies = requests.get(
        f"{BASE_URL}/trending/movie/day",
        params=params,
        timeout=10
    ).json().get("results", [])

    popular_movies = requests.get(
        f"{BASE_URL}/movie/popular",
        params=params,
        timeout=10
    ).json().get("results", [])

    top_movies = requests.get(
        f"{BASE_URL}/movie/top_rated",
        params=params,
        timeout=10
    ).json().get("results", [])

    trending_tv = requests.get(
        f"{BASE_URL}/trending/tv/day",
        params=params,
        timeout=10
    ).json().get("results", [])

    popular_tv = requests.get(
        f"{BASE_URL}/tv/popular",
        params=params,
        timeout=10
    ).json().get("results", [])

    toprated_tv = requests.get(
        f"{BASE_URL}/tv/top_rated",
        params=params,
        timeout=10
    ).json().get("results", [])

    # add logos only for hero items
    for movie in trending_movies[:5]:
        movie["logo"] = get_movie_logo(movie["id"])

    for show in trending_tv[:5]:
        show["logo"] = get_tv_logo(show["id"])

    data = {
        "trending_movies": trending_movies,
        "popular_movies": popular_movies,
        "top_movies": top_movies,
        "trending_tv": trending_tv,
        "popular_tv": popular_tv,
        "toprated_tv": toprated_tv
    }

    cache.set(cache_key, data, 21600)  # 6 hours

    return data








def index(request):
    genre_movies = load_index_genre_movies()
    return render(request, "uzzutv/index.html", {"genre_movies": genre_movies})


def load_index_genre_movies():

    cache_key = "index_genre_movies_v3"
    data = cache.get(cache_key)

    if data:
        return data

    genres = {
        "action": 28,
        "comedy": 35,
        "thriller": 53,
        "scifi": 878,
        "drama": 18,
        "horror": 27,
        "romance": 10749
    }

    # these render as big cards that link straight to the watch page
    tv_genres_for_cards = {
        "action": 10759,
        "comedy": 35,
        "thriller": "9648|80",
        "scifi": 10765
    }

    data = {}

    used = set()

    for name, gid in genres.items():

        base_params = {
            "api_key": API_KEY,
            "sort_by": "popularity.desc",
            "vote_count.gte": 300
        }

        try:

            response = requests.get(
                f"{BASE_URL}/discover/movie",
                params={**base_params, "with_genres": gid},
                timeout=10
            )

            results = response.json().get("results", [])

            for m in results:
                m["media_type"] = "movie"

            candidates = results

            if name in tv_genres_for_cards:

                shows = requests.get(
                    f"{BASE_URL}/discover/tv",
                    params={**base_params, "with_genres": tv_genres_for_cards[name]},
                    timeout=10
                ).json().get("results", [])

                for t in shows:
                    t["media_type"] = "tv"

                combined = []
                for i in range(max(len(results), len(shows))):
                    if i < len(results):
                        combined.append(results[i])
                    if i < len(shows):
                        combined.append(shows[i])

                candidates = combined

            available = [
                m for m in candidates if m["id"] not in used
            ]

            pick = available[0] if available else None
            pick2 = available[1] if len(available) > 1 else None

            if pick:
                used.add(pick["id"])
            if pick2:
                used.add(pick2["id"])

            entry = {
                "poster_path": pick["poster_path"] if pick else None,
                "stack_poster_path": pick2["poster_path"] if pick2 else None
            }

            if name in tv_genres_for_cards:
                entry["id"] = pick["id"] if pick else None
                entry["media_type"] = pick["media_type"] if pick else "movie"

            data[name] = entry

        except Exception:

            entry = {
                "poster_path": None,
                "stack_poster_path": None
            }

            if name in tv_genres_for_cards:
                entry["id"] = None
                entry["media_type"] = "movie"

            data[name] = entry

    cache.set(cache_key, data, 21600)  # 6 hours

    return data


# ----------------------------
# LOGO FUNCTIONS (CACHED)
# ----------------------------

def get_movie_logo(movie_id):

    cache_key = f"movie_logo_{movie_id}"
    logo = cache.get(cache_key)

    if logo is not None:
        return logo

    url = f"{BASE_URL}/movie/{movie_id}/images"

    params = {
        "api_key": API_KEY,
        "include_image_language": "en,null"
    }

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return None

    data = response.json()
    logos = data.get("logos", [])

    logo = None

    # Prefer English logos
    for l in logos:
        if l.get("iso_639_1") == "en":
            logo = l["file_path"]
            break

    # fallback to any logo
    if not logo and logos:
        logo = logos[0]["file_path"]

    cache.set(cache_key, logo, 5000)

    return logo


def get_tv_logo(tv_id):

    cache_key = f"tv_logo_{tv_id}"
    logo = cache.get(cache_key)

    if logo is not None:
        return logo

    url = f"{BASE_URL}/tv/{tv_id}/images"

    params = {
        "api_key": API_KEY,
        "include_image_language": "en,null"
    }

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return None

    data = response.json()
    logos = data.get("logos", [])

    logo = None

    for l in logos:
        if l.get("iso_639_1") == "en":
            logo = l["file_path"]
            break

    if not logo and logos:
        logo = logos[0]["file_path"]

    cache.set(cache_key, logo, 5000)

    return logo


# ----------------------------
# MOVIE LISTS (CACHED)
# ----------------------------

def trendingMovie():

    movies = cache.get("trending_movies")

    if movies:
        return movies

    url = f"{BASE_URL}/trending/movie/day"
    params = {"api_key": API_KEY}

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return []

    data = response.json()
    movies = data.get("results", [])

    for movie in movies:
        movie["logo"] = get_movie_logo(movie["id"])

    cache.set("trending_movies", movies, 21600)

    return movies


def popularMovie():

    movies = cache.get("popular_movies")

    if movies:
        return movies

    url = f"{BASE_URL}/movie/popular"
    params = {"api_key": API_KEY}

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return []

    data = response.json()
    movies = data.get("results", [])

    cache.set("popular_movies", movies, 3600)

    return movies


def topMovie():

    movies = cache.get("top_movies")

    if movies:
        return movies

    url = f"{BASE_URL}/movie/top_rated"
    params = {"api_key": API_KEY}

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return []

    data = response.json()
    movies = data.get("results", [])

    cache.set("top_movies", movies, 3600)

    return movies


# ----------------------------
# TV LISTS (CACHED)
# ----------------------------

def trending_tv():

    shows = cache.get("trending_tv")

    if shows:
        return shows

    url = f"{BASE_URL}/trending/tv/day"
    params = {"api_key": API_KEY}

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return []

    data = response.json()
    shows = data.get("results", [])

    for show in shows:
        show["logo"] = get_tv_logo(show["id"])

    cache.set("trending_tv", shows, 21600)

    return shows


def popular_tv():

    shows = cache.get("popular_tv")

    if shows:
        return shows

    url = f"{BASE_URL}/tv/popular"
    params = {"api_key": API_KEY}

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return []

    data = response.json()
    shows = data.get("results", [])

    cache.set("popular_tv", shows, 3600)

    return shows


def toprated_tv():

    shows = cache.get("toprated_tv")

    if shows:
        return shows

    url = f"{BASE_URL}/tv/top_rated"
    params = {"api_key": API_KEY}

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return []

    data = response.json()
    shows = data.get("results", [])

    cache.set("toprated_tv", shows, 3600)

    return shows


# ----------------------------
# PAGES
# ----------------------------

def movie(request):

    data = load_homepage_data()

    return render(request, "uzzutv/movie.html", {
        "trendingMovie": data["trending_movies"],
        "popularMovie": data["popular_movies"],
        "toprated": data["top_movies"]
    })

def tv(request):

    data = load_homepage_data()

    return render(request, "uzzutv/tv.html", {
        "trendingtv": data["trending_tv"],
        "populartv": data["popular_tv"],
        "topratedtv": data["toprated_tv"]
    })


# ----------------------------
# WATCH TV
# ----------------------------

def watchtv(request, tv_id):

    season = request.GET.get("season", 1)
    episode = request.GET.get("episode", 1)
    params = {"api_key": API_KEY}

    # -----------------------------
    # IMDb ID (CACHED)
    # -----------------------------

    imdb_cache_key = f"imdb_tv_{tv_id}"
    imdb = cache.get(imdb_cache_key)

    if not imdb:

        external = requests.get(
            f"{BASE_URL}/tv/{tv_id}/external_ids",
            params=params,
            timeout=10
        ).json()

        imdb = external.get("imdb_id")

        if not imdb:
            return HttpResponse("IMDb ID not available")

        cache.set(imdb_cache_key, imdb, 86400)

    # -----------------------------
    # TV DETAILS (CACHED)
    # -----------------------------

    tv_cache_key = f"tv_details_{tv_id}"
    tv = cache.get(tv_cache_key)

    if not tv:

        tv = requests.get(
            f"{BASE_URL}/tv/{tv_id}",
            params=params,
            timeout=10
        ).json()

        cache.set(tv_cache_key, tv, 86400)

    seasons = tv.get("seasons", [])

    # -----------------------------
    # SEASON EPISODES (CACHED)
    # -----------------------------

    season_cache_key = f"season_{tv_id}_{season}"
    season_data = cache.get(season_cache_key)

    if not season_data:

        season_data = requests.get(
            f"{BASE_URL}/tv/{tv_id}/season/{season}",
            params=params,
            timeout=10
        ).json()

        cache.set(season_cache_key, season_data, 86400)

    episodes = season_data.get("episodes", [])
    poster = tv.get("poster_path")
    # -----------------------------
    # PLAYER URL
    # -----------------------------
    url5 =f"https://player.videasy.net/tv/{tv_id}/{season}/{episode}?color=8B5CF6&autoPlay=true&nextEpisode=false&episodeSelector=fasle"
    url4 = f"https://vidfast.pro/tv/{imdb}/{season}/{episode}?autoPlay=true&sub=en&mute=false"
    url2 = f"https://vidnest.fun/tv/{tv_id}/{season}/{episode}"
    url3 = f"https://vidsrcme.ru/embed/tv?imdb={imdb}&season={season}&episode={episode}&ds_lang=en&autoplay=1"
    url = f"https://www.vidking.net/embed/tv/{tv_id}/{season}/{episode}?color=e50914&autoPlay=true&nextEpisode=false&episodeSelector=fasle"

    return render(request, "uzzutv/watchtv.html", {
        "id": tv_id,
        "poster": poster,
        "url":url,
        "url2":url2,
        "url3": url3,
        "url4":url4,
        "url5":url5,
        "imdb": imdb,
        "title": tv.get("name", ""),
        "seasons": seasons,
        "episodes": episodes,
        "current_season": int(season),
        "current_episode": int(episode)
    })


# ----------------------------
# WATCH MOVIE
# ----------------------------

def watchmov(request, movie_id):

    params = {"api_key": API_KEY}

    # -----------------------------
    # IMDb ID (CACHED)
    # -----------------------------

    imdb_cache_key = f"imdb_movie_{movie_id}"
    imdb = cache.get(imdb_cache_key)

    if not imdb:

        external = requests.get(
            f"{BASE_URL}/movie/{movie_id}/external_ids",
            params=params,
            timeout=10
        ).json()

        imdb = external.get("imdb_id")

        if not imdb:
            return HttpResponse("Movie not available")

        cache.set(imdb_cache_key, imdb, 86400)  # cache 24 hours

    # -----------------------------
    # MOVIE TITLE (CACHED)
    # -----------------------------

    title_cache_key = f"movie_title_{movie_id}"
    title = cache.get(title_cache_key)

    poster_cache_key = f"movie_poster_{movie_id}"
    poster = cache.get(poster_cache_key)

    if not title:

        movie_data = requests.get(
            f"{BASE_URL}/movie/{movie_id}",
            params=params,
            timeout=10
        ).json()

        title = movie_data.get("title", "")

        if not poster:
            poster = movie_data.get("poster_path", "")

        if title:
            cache.set(title_cache_key, title, 86400)

        if poster:
            cache.set(poster_cache_key, poster, 86400)

    # -----------------------------
    # PLAYER URL
    # -----------------------------
    url = f"https://www.vidking.net/embed/movie/{movie_id}?color=e50914&autoPlay=true"
    url2 = f"https://vidnest.fun/movie/{movie_id}?autoPlay=true&sub=en"
    url3 = f"https://vidsrcme.ru/embed/movie?imdb={imdb}&ds_lang=en&autoplay=1"
    url4 = f"https://vidfast.pro/movie/{imdb}?autoPlay=true&sub=en&mute=false"
    url5 = f"https://player.videasy.net/movie/{movie_id}?color=8B5CF6&autoPlay=true"
    return render(request, "uzzutv/watchmov.html", {
        "url": url,
        "url2": url2,
        "url3": url3,
        "url4":url4,
        "url5": url5,
        "id":imdb,
        "tmdb_id": movie_id,
        "poster": poster,
        "title":title
    })



def search(request):

    query = request.GET.get("q")

    movies = []
    tv = []

    if query:

        cache_key = f"search_{query.strip().lower()}"
        cached = cache.get(cache_key)

        if cached is not None:
            movies, tv = cached

        else:
            movie_url = f"https://api.themoviedb.org/3/search/movie?api_key={API_KEY}&query={query}"
            tv_url = f"https://api.themoviedb.org/3/search/tv?api_key={API_KEY}&query={query}"

            movies = requests.get(movie_url, timeout=10).json().get("results", [])
            tv = requests.get(tv_url, timeout=10).json().get("results", [])

            cache.set(cache_key, (movies, tv), 3600)  # 1 hour

    return render(request,"uzzutv/search.html",{
        "query":query,
        "movies":movies,
        "tvshows":tv
    })


def discover_mix(movie_genre, tv_genre, cache_key):

    data = cache.get(cache_key)

    if data:
        return data

    params = {"api_key": API_KEY}

    movie = requests.get(
        f"{BASE_URL}/discover/movie",
        params={**params, "with_genres": movie_genre},
        timeout=10
    ).json().get("results", [])

    tv = requests.get(
        f"{BASE_URL}/discover/tv",
        params={**params, "with_genres": tv_genre},
        timeout=10
    ).json().get("results", [])

    for m in movie:
        m["media_type"] = "movie"

    for t in tv:
        t["media_type"] = "tv"

    mixed = movie + tv

    cache.set(cache_key, mixed, 3600)

    return mixed

def load_homepage_data2():

    cache_key = "homepage_data_mix"
    data = cache.get(cache_key)

    if data:
        return data

    params = {"api_key": API_KEY}

    # MIXED trending (movie + tv)
    trending = requests.get(
        f"{BASE_URL}/trending/all/day",
        params=params,
        timeout=10
    ).json().get("results", [])

    # add logos for hero (home.html shows hero|slice:"10:" = items 10-19)
    for item in trending[10:20]:

        if item["media_type"] == "movie":
            item["logo"] = get_movie_logo(item["id"])

        elif item["media_type"] == "tv":
            item["logo"] = get_tv_logo(item["id"])

    # GENRE ROWS
    action = discover_mix(28, 10759, "genre_action")
    romance = discover_mix(10749, 10749, "genre_romance")
    comedy = discover_mix(35, 35, "genre_comedy")
    anime = discover_mix(16, 16, "anime")

    data = {
        "hero": trending,
        "top10": trending[:10],
        "action": action,
        "romance": romance,
        "comedy": comedy,
        "anime": anime
    }

    cache.set(cache_key, data, 21600)

    return data


def home(request):

    data = load_homepage_data2()

    return render(request, "uzzutv/home.html", {
        "hero": data["hero"],
        "top10": data["top10"],
        "action": data["action"],
        "romance": data["romance"],
        "comedy": data["comedy"],
        "anime": data["anime"]
    })





# ----------------------------
# CATEGORY PAGES (PAGINATED)
# ----------------------------

CATEGORY_CONFIG = {
    "action":     {"movie_genre": 28,    "tv_genre": 10759,     "title": "Action"},
    "romance":    {"movie_genre": 10749, "tv_genre": 10749,     "title": "Romance"},
    "comedy":     {"movie_genre": 35,    "tv_genre": 35,        "title": "Comedy"},
    "animation":  {"movie_genre": 16,    "tv_genre": 16,        "title": "Animation"},
    "thriller":   {"movie_genre": 53,    "tv_genre": "9648|80", "title": "Thriller"},
    "drama":      {"movie_genre": 18,    "tv_genre": 18,        "title": "Drama"},
    "horror":     {"movie_genre": 27,    "tv_genre": 9648,      "title": "Horror"},
    "scifi":      {"movie_genre": 878,   "tv_genre": 10765,     "title": "Sci-Fi"},
    "popular":    {"title": "Popular",    "special": "popular"},
    "top_rated":  {"title": "Top Rated",  "special": "top_rated"},
}

CATEGORY_PER_PAGE = 24


def discover_source(media_type, genre, page):
    """Cached TMDB discover results for a single media type + genre + page."""

    cache_key = f"discover_{media_type}_{genre}_p{page}"
    data = cache.get(cache_key)

    if data is not None:
        return data

    params = {
        "api_key": API_KEY,
        "with_genres": genre,
        "sort_by": "popularity.desc",
        "vote_count.gte": 100,
        "page": page,
    }

    try:
        payload = requests.get(
            f"{BASE_URL}/discover/{media_type}",
            params=params,
            timeout=10
        ).json()
        results = payload.get("results", [])
        total_pages = payload.get("total_pages", 1)
        for item in results:
            item["media_type"] = media_type
    except Exception:
        results, total_pages = [], 1

    cache.set(cache_key, (results, total_pages), 21600)

    return results, total_pages


def load_category_page(slug, page):
    """30 items per page, mixed movie + TV, balanced round-robin feed."""

    cfg = CATEGORY_CONFIG[slug]

    cache_key = f"category_page_v2_{slug}_{page}"
    data = cache.get(cache_key)

    if data:
        return data

    movies, movie_total = discover_source("movie", cfg["movie_genre"], page)
    tv, tv_total = discover_source("tv", cfg["tv_genre"], page)

    combined = []
    for i in range(max(len(movies), len(tv))):
        if i < len(movies):
            combined.append(movies[i])
        if i < len(tv):
            combined.append(tv[i])

    items = combined[:CATEGORY_PER_PAGE]

    total_items = (movie_total + tv_total) * 20
    total_pages = max(1, -(-total_items // CATEGORY_PER_PAGE))

    data = {"items": items, "total_pages": total_pages}
    cache.set(cache_key, data, 21600)

    return data


def load_popular_page(page, media_type=None):
    """Load popular movies + TV for a given page, optionally filtered by media_type."""
    cache_key = f"category_popular_{media_type or 'all'}_p{page}"
    data = cache.get(cache_key)

    if data:
        return data

    movies = popularMovie()
    tv = popular_tv()

    # Add media_type
    for m in movies:
        m["media_type"] = "movie"
    for t in tv:
        t["media_type"] = "tv"

    # Filter by media_type if specified
    if media_type == "movie":
        combined = movies
    elif media_type == "tv":
        combined = tv
    else:
        # Interleave movie + TV
        combined = []
        for i in range(max(len(movies), len(tv))):
            if i < len(movies):
                combined.append(movies[i])
            if i < len(tv):
                combined.append(tv[i])

    items = combined[(page - 1) * CATEGORY_PER_PAGE:page * CATEGORY_PER_PAGE]
    total_pages = max(1, -(-len(combined) // CATEGORY_PER_PAGE))

    data = {"items": items, "total_pages": total_pages}
    cache.set(cache_key, data, 3600)
    return data


def load_top_rated_page(page, media_type=None):
    """Load top rated movies + TV for a given page, optionally filtered by media_type."""
    cache_key = f"category_top_rated_{media_type or 'all'}_p{page}"
    data = cache.get(cache_key)

    if data:
        return data

    movies = topMovie()
    tv = toprated_tv()

    # Add media_type
    for m in movies:
        m["media_type"] = "movie"
    for t in tv:
        t["media_type"] = "tv"

    # Filter by media_type if specified
    if media_type == "movie":
        combined = movies
    elif media_type == "tv":
        combined = tv
    else:
        # Interleave movie + TV
        combined = []
        for i in range(max(len(movies), len(tv))):
            if i < len(movies):
                combined.append(movies[i])
            if i < len(tv):
                combined.append(tv[i])

    items = combined[(page - 1) * CATEGORY_PER_PAGE:page * CATEGORY_PER_PAGE]
    total_pages = max(1, -(-len(combined) // CATEGORY_PER_PAGE))

    data = {"items": items, "total_pages": total_pages}
    cache.set(cache_key, data, 3600)
    return data


def category(request, slug):

    if slug not in CATEGORY_CONFIG:
        raise Http404("Category not found")

    try:
        page = max(1, int(request.GET.get("page", 1)))
    except (TypeError, ValueError):
        page = 1

    # Get media_type filter from query string (movie, tv, or None for all)
    media_type = request.GET.get("type")
    if media_type not in ("movie", "tv"):
        media_type = None

    cfg = CATEGORY_CONFIG[slug]

    # Handle special categories
    if cfg.get("special") == "popular":
        data = load_popular_page(page, media_type)
    elif cfg.get("special") == "top_rated":
        data = load_top_rated_page(page, media_type)
    else:
        data = load_category_page(slug, page)

    pages = []
    total = data["total_pages"]
    for p in range(1, total + 1):
        if p == 1 or p == total or abs(p - page) <= 2:
            if pages and pages[-1] != "..." and p - 1 != pages[-1]:
                pages.append("...")
            pages.append(p)

    return render(request, "uzzutv/category.html", {
        "slug": slug,
        "category_title": cfg["title"],
        "items": data["items"],
        "page": page,
        "total_pages": total,
        "per_page": CATEGORY_PER_PAGE,
        "pages": pages,
        "media_type": media_type,
    })


def detail(request, type, id):

    cache_key = f"detail_v2_{type}_{id}"
    context = cache.get(cache_key)

    if not context:

        url = f"https://api.themoviedb.org/3/{type}/{id}?api_key={API_KEY}&append_to_response=credits,recommendations"

        response = requests.get(url, timeout=10)

        if response.status_code != 200:
            raise Http404(f"{type} {id} not found")

        data = response.json()

        title = data.get("title") or data.get("name", "")
        year = None
        raw_date = data.get("release_date") or data.get("first_air_date")
        if raw_date:
            year = raw_date[:4]

        title_full = f"{title} ({year})" if year else title

        overview = (data.get("overview") or "").strip()
        if overview:
            meta_desc = f"Watch {title} on UzzUTV. {overview}"
        else:
            meta_desc = f"Watch {title} on UzzUTV. Explore details, cast and streaming options."

        genres = data.get("genres") or []

        if type == "movie":
            logo = get_movie_logo(id)
        else:
            logo = get_tv_logo(id)

        context = {
            "data": data,
            "type": type,
            "title_full": title_full,
            "meta_desc": meta_desc,
            "logo": logo,
            "genres": [g.get("name", "") for g in genres],
            "cast": data["credits"]["cast"][:12],
            "recommendations": data["recommendations"]["results"][:14]
        }

        cache.set(cache_key, context, 43200)  # 12 hours

    return render(request, "uzzutv/detail.html", context)

def watchlist(request):
    return render(request, "uzzutv/watchlist.html")


# ----------------------------
# WATCH PARTY
# ----------------------------

def party(request):
    """Watch Party dashboard (create / join / manage own parties)."""

    return render(request, "uzzutv/party.html")


def party_room(request, room_code):
    """Watch Party room page. Supabase auth + data are handled client-side."""

    return render(request, "uzzutv/party_room.html", {
        "room_code": room_code
    })

def rated(request, user_id=None):
    return render(request, "uzzutv/rated.html", {"user_id": user_id})

def terms(request):
    return render(request, "uzzutv/terms.html")

def dmca(request):
    return render(request, "uzzutv/dmca.html")


SITE_URL = "https://uzzutv.pythonanywhere.com"


def robots_txt(request):
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /auth/",
        "Disallow: /profile/",
        "Disallow: /watchlist/",
        "Disallow: /rated/",
        "Disallow: /admin/",
        "Disallow: /media-info/",
        "",
        f"Sitemap: {SITE_URL}/sitemap.xml",
    ]
    return HttpResponse("\n".join(lines), content_type="text/plain")


def sitemap_xml(request):

    cache_key = "sitemap_urls_v2"
    urls = cache.get(cache_key)

    if urls is None:

        urls = [
            {"loc": f"{SITE_URL}/", "priority": "1.0"},
            {"loc": f"{SITE_URL}/home/", "priority": "1.0"},
            {"loc": f"{SITE_URL}/movie/", "priority": "0.9"},
            {"loc": f"{SITE_URL}/tv/", "priority": "0.9"},
            {"loc": f"{SITE_URL}/search/", "priority": "0.5"},
            {"loc": f"{SITE_URL}/terms/", "priority": "0.3"},
            {"loc": f"{SITE_URL}/dmca/", "priority": "0.3"},
        ]

        seen = set()

        try:
            data = load_homepage_data()
            groups = [
                ("movie", data["trending_movies"]),
                ("movie", data["popular_movies"]),
                ("movie", data["top_movies"]),
                ("tv", data["trending_tv"]),
                ("tv", data["popular_tv"]),
                ("tv", data["toprated_tv"]),
            ]
            for media_type, items in groups:
                for item in items:
                    item_id = item.get("id")
                    if item_id is None:
                        continue
                    key = (media_type, item_id)
                    if key in seen:
                        continue
                    seen.add(key)
                    urls.append({
                        "loc": f"{SITE_URL}/{media_type}/{item_id}/",
                        "priority": "0.8",
                    })
        except Exception:
            pass

        cache.set(cache_key, urls, 21600)

    items = "".join(
        f"<url><loc>{u['loc']}</loc><changefreq>daily</changefreq><priority>{u['priority']}</priority></url>"
        for u in urls
    )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{items}\n"
        "</urlset>"
    )

    return HttpResponse(xml, content_type="application/xml")


# ================================================================
# ANILOST API
# ================================================================

ANILIST_URL = "https://graphql.anilist.co"


def anilist_query(query, variables=None):
    """Execute a GraphQL query against the AniList API with caching."""
    try:
        resp = requests.post(
            ANILIST_URL,
            json={"query": query, "variables": variables or {}},
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        return resp.json().get("data")
    except Exception:
        return None


# ----------------------------------------------------------------
# QUERIES
# ----------------------------------------------------------------

ANIME_PAGE_QUERY = """
query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $season: MediaSeason, $seasonYear: Int, $type: MediaType) {
  Page(page: $page, perPage: $perPage) {
    media(sort: $sort, status: $status, season: $season, seasonYear: $seasonYear, type: $type, countryOfOrigin: JP) {
      id
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage
      averageScore
      popularity
      format
      episodes
      duration
      status
      season
      seasonYear
      genres
    }
  }
}

"""

ANIME_DETAIL_QUERY = """
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    coverImage { large extraLarge }
    bannerImage
    description(asHtml: false)
    averageScore
    popularity
    favourites
    format
    episodes
    duration
    status
    season
    seasonYear
    countryOfOrigin
    genres
    tags { name }
    startDate { year month day }
    endDate { year month day }
    studios(isMain: true) { nodes { name } }
    source
    rankings { rank type context year season }
    trailer { id site thumbnail }
    relations {
      edges {
        relationType
        node {
          ... on Media {
            id
            title { romaji english }
            coverImage { large }
            format
            episodes
            status
            averageScore
          }
        }
      }
    }
    recommendations(perPage: 12, sort: RATING_DESC) {
      nodes {
        mediaRecommendation {
          id
          title { romaji english }
          coverImage { large }
          bannerImage
          format
          episodes
          averageScore
          status
        }
      }
    }
    characters(perPage: 12, role: MAIN, sort: FAVOURITES_DESC) {
      edges {
        node {
          id
          name { full }
          image { large }
        }
        role
      }
    }
    staff(perPage: 6, sort: FAVOURITES_DESC) {
      edges {
        node {
          id
          name { full }
          image { large }
        }
        role
      }
    }
  }
}

"""


AIRING_SCHEDULE_QUERY = """
query ($start: Int, $end: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      id
      airingAt
      episode
      media {
        id
        title { romaji english }
        coverImage { large }
        format
        episodes
        averageScore
        season
        seasonYear
      }
    }
    pageInfo { total lastPage hasNextPage }
  }
}

"""

GENRE_MEDIA_QUERY = """
query ($genre: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(genre: $genre, type: ANIME, countryOfOrigin: JP, sort: POPULARITY_DESC) {
      id
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage
      averageScore
      popularity
      format
      episodes
      duration
      status
      season
      seasonYear
      genres
    }
    pageInfo { total lastPage hasNextPage }
  }
}

"""

ANILIST_GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy",
    "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery",
    "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports",
    "Supernatural", "Thriller",
]

SEARCH_ANIME_QUERY = """
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, countryOfOrigin: JP, sort: POPULARITY_DESC) {
      id
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage
      averageScore
      popularity
      format
      episodes
      duration
      status
      season
      seasonYear
      genres
    }
    pageInfo { total lastPage hasNextPage }
  }
}

"""


# ----------------------------------------------------------------
# DATA FETCHERS
# ----------------------------------------------------------------

def anilist_trending():
    cache_key = "anilist_trending"
    data = cache.get(cache_key)
    if data:
        return data

    data = anilist_query(ANIME_PAGE_QUERY, {
        "page": 1, "perPage": 15,
        "sort": ["TRENDING_DESC", "POPULARITY_DESC"],
        "type": "ANIME",
    })
    items = (data or {}).get("Page", {}).get("media", [])
    cache.set(cache_key, items, 21600)
    return items


def anilist_popular():
    cache_key = "anilist_popular"
    data = cache.get(cache_key)
    if data:
        return data

    data = anilist_query(ANIME_PAGE_QUERY, {
        "page": 1, "perPage": 15,
        "sort": ["POPULARITY_DESC"],
        "type": "ANIME",
    })
    items = (data or {}).get("Page", {}).get("media", [])
    cache.set(cache_key, items, 21600)
    return items


def anilist_current_season():
    import datetime
    now = datetime.date.today()
    month = now.month
    if month <= 3:
        season = "WINTER"
    elif month <= 6:
        season = "SPRING"
    elif month <= 9:
        season = "SUMMER"
    else:
        season = "FALL"

    year = now.year

    cache_key = f"anilist_season_{season}_{year}"
    data = cache.get(cache_key)
    if data:
        return data

    data = anilist_query(ANIME_PAGE_QUERY, {
        "page": 1, "perPage": 15,
        "sort": ["POPULARITY_DESC"],
        "season": season,
        "seasonYear": year,
        "type": "ANIME",
    })
    items = (data or {}).get("Page", {}).get("media", [])
    cache.set(cache_key, items, 21600)
    return items


def anilist_airing():
    cache_key = "anilist_airing"
    data = cache.get(cache_key)
    if data:
        return data

    data = anilist_query(ANIME_PAGE_QUERY, {
        "page": 1, "perPage": 15,
        "sort": ["POPULARITY_DESC"],
        "status": "RELEASING",
        "type": "ANIME",
    })
    items = (data or {}).get("Page", {}).get("media", [])
    cache.set(cache_key, items, 21600)
    return items


def anilist_top_rated():
    cache_key = "anilist_top_rated"
    data = cache.get(cache_key)
    if data:
        return data

    data = anilist_query(ANIME_PAGE_QUERY, {
        "page": 1, "perPage": 15,
        "sort": ["SCORE_DESC"],
        "type": "ANIME",
    })
    items = (data or {}).get("Page", {}).get("media", [])
    cache.set(cache_key, items, 21600)
    return items


def anilist_anime_detail(anilist_id):
    cache_key = f"anilist_detail_{anilist_id}"
    context = cache.get(cache_key)
    if context:
        return context

    data = anilist_query(ANIME_DETAIL_QUERY, {"id": anilist_id})
    media = (data or {}).get("Media")
    if not media:
        return None

    title = media.get("title", {}).get("english") or media.get("title", {}).get("romaji") or ""
    romaji = media.get("title", {}).get("romaji", "")
    native = media.get("title", {}).get("native", "")

    description = (media.get("description") or "").strip()

    raw_score = media.get("averageScore")
    score_str = f"{raw_score}%" if raw_score else None

    genres = media.get("genres") or []

    studios = [s.get("name", "") for s in (media.get("studios", {}).get("nodes", []))]
    tags = [t.get("name", "") for t in (media.get("tags") or []) if t.get("name")]

    related_edges = media.get("relations", {}).get("edges", [])
    related_anime = []
    wanted_rel = {"SEQUEL", "PREQUEL", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "ADAPTATION", "CHARACTER", "SUMMARY", "OTHER"}
    for edge in related_edges:
        rel_type = edge.get("relationType", "")
        if rel_type in wanted_rel:
            node = edge.get("node", {})
            if node.get("id"):
                related_anime.append({
                    "id": node["id"],
                    "title": node.get("title", {}).get("english") or node.get("title", {}).get("romaji", ""),
                    "cover": (node.get("coverImage") or {}).get("large", ""),
                    "format": node.get("format", ""),
                    "episodes": node.get("episodes"),
                    "status": node.get("status", ""),
                    "score": node.get("averageScore"),
                    "relation": rel_type.replace("_", " ").title(),
                })

    rec_nodes = media.get("recommendations", {}).get("nodes", [])
    recommendations = []
    for rec in rec_nodes:
        rm = rec.get("mediaRecommendation", {})
        if rm.get("id"):
            recommendations.append({
                "id": rm["id"],
                "title": rm.get("title", {}).get("english") or rm.get("title", {}).get("romaji", ""),
                "cover": (rm.get("coverImage") or {}).get("large", ""),
                "banner": rm.get("bannerImage", ""),
                "format": rm.get("format", ""),
                "episodes": rm.get("episodes"),
                "score": rm.get("averageScore"),
                "status": rm.get("status", ""),
            })

    characters = []
    for edge in (media.get("characters", {}).get("edges", [])):
        node = edge.get("node", {})
        if node.get("id"):
            characters.append({
                "id": node["id"],
                "name": node.get("name", {}).get("full", ""),
                "image": (node.get("image") or {}).get("large", ""),
            })

    staff_list = []
    for edge in (media.get("staff", {}).get("edges", [])):
        node = edge.get("node", {})
        if node.get("id"):
            staff_list.append({
                "id": node["id"],
                "name": node.get("name", {}).get("full", ""),
                "image": (node.get("image") or {}).get("large", ""),
            })

    context = {
        "anime": media,
        "title": title,
        "romaji": romaji,
        "native": native,
        "description": description,
        "score_str": score_str,
        "score_raw": raw_score,
        "genres": genres,
        "studios": studios,
        "tags": [t.get("name", "") for t in (media.get("tags") or [])],
        "related": related_anime,
        "recommendations": recommendations,
        "characters": characters,
        "staff": staff_list,
        "meta_desc": f"Watch {title} on UzzUTV Aniuzu. Explore details, genres and related anime.",
    }

    cache.set(cache_key, context, 43200)
    return context


def anilist_search(query, page=1):
    cache_key = f"anilist_search_{query.strip().lower()}_p{page}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = anilist_query(SEARCH_ANIME_QUERY, {
        "search": query.strip(),
        "page": page,
        "perPage": 24,
    })
    page_data = (data or {}).get("Page", {})
    items = page_data.get("media", [])
    total_pages = (page_data.get("pageInfo") or {}).get("lastPage", 1)

    result = {"items": items, "total_pages": total_pages}
    cache.set(cache_key, result, 3600)
    return result


def anilist_schedule(start_ts, end_ts, page=1):
    import datetime
    date_label = datetime.date.fromtimestamp(start_ts).isoformat()
    cache_key = f"anilist_schedule_{date_label}_p{page}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = anilist_query(AIRING_SCHEDULE_QUERY, {
        "start": start_ts,
        "end": end_ts,
        "page": page,
        "perPage": 50,
    })
    page_data = (data or {}).get("Page", {})
    raw = page_data.get("airingSchedules", [])
    total_pages = (page_data.get("pageInfo") or {}).get("lastPage", 1)

    seen = set()
    entries = []
    for s in raw:
        media = s.get("media", {})
        mid = media.get("id")
        if not mid or mid in seen:
            continue
        seen.add(mid)
        entries.append({
            "id": mid,
            "title": media.get("title", {}).get("english") or media.get("title", {}).get("romaji", ""),
            "cover": (media.get("coverImage") or {}).get("large", ""),
            "format": media.get("format", ""),
            "episodes": media.get("episodes"),
            "score": media.get("averageScore"),
            "episode": s.get("episode"),
            "airing_at": s.get("airingAt"),
        })

    result = {"items": entries, "total_pages": total_pages}
    cache.set(cache_key, result, 1800)
    return result


def anilist_by_genre(genre, page=1):
    cache_key = f"anilist_genre_{genre.lower()}_p{page}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = anilist_query(GENRE_MEDIA_QUERY, {
        "genre": genre,
        "page": page,
        "perPage": 24,
    })
    page_data = (data or {}).get("Page", {})
    items = page_data.get("media", [])
    total_pages = (page_data.get("pageInfo") or {}).get("lastPage", 1)

    result = {"items": items, "total_pages": total_pages}
    cache.set(cache_key, result, 3600)
    return result


# ================================================================
# ANILOST HELPER — sanitize HTML descriptions
# ================================================================

def sanitize_anilist_description(text):
    """Strip HTML tags from AniList descriptions."""
    import re
    clean = re.sub(r'<[^>]+>', '', text or '')
    clean = clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&#039;', "'").replace('&quot;', '"')
    return clean.strip()


# ================================================================
# ANIZU VIEWS
# ================================================================

def aniuzu(request):
    """Main Aniuzu anime browsing page."""
    trending = anilist_trending()
    popular = anilist_popular()
    airing = anilist_airing()
    seasonal = anilist_current_season()
    top_rated = anilist_top_rated()

    hero = trending[:5] if trending else []

    return render(request, "uzzutv/aniuzu.html", {
        "hero": hero,
        "trending": trending,
        "popular": popular,
        "airing": airing,
        "seasonal": seasonal,
        "top_rated": top_rated,
    })


def aniuzu_detail(request, anilist_id):
    """Anime detail page."""
    ctx = anilist_anime_detail(anilist_id)
    if ctx is None:
        raise Http404("Anime not found")

    ctx["anilist_id"] = anilist_id
    ctx["meta_desc"] = sanitize_anilist_description(ctx["meta_desc"])
    ctx["description"] = sanitize_anilist_description(ctx["description"])

    return render(request, "uzzutv/aniuzu_detail.html", ctx)


def aniuzu_search(request):
    """Aniuzu anime search."""
    query = request.GET.get("q", "").strip()
    page = max(1, int(request.GET.get("page", 1)))

    items = []
    total_pages = 1

    if query:
        result = anilist_search(query, page)
        items = result["items"]
        total_pages = result["total_pages"]

    pages = []
    for p in range(1, total_pages + 1):
        if p == 1 or p == total_pages or abs(p - page) <= 2:
            if pages and pages[-1] != "..." and p - 1 != pages[-1]:
                pages.append("...")
            pages.append(p)

    return render(request, "uzzutv/aniuzu_search.html", {
        "query": query,
        "items": items,
        "page": page,
        "total_pages": total_pages,
        "pages": pages,
    })


def aniuzu_schedule(request):
    """Airing schedule page — shows anime airing this week."""
    import datetime, calendar, time

    today = datetime.date.today()
    start_of_week = today - datetime.timedelta(days=today.weekday())
    end_of_week = start_of_week + datetime.timedelta(days=6)

    start_ts = int(time.mktime(start_of_week.timetuple()))
    end_ts = int(time.mktime(end_of_week.timetuple())) + 86399

    view = request.GET.get("view", "week")
    if view == "today":
        start_ts = int(time.mktime(today.timetuple()))
        end_ts = start_ts + 86399

    result = anilist_schedule(start_ts, end_ts)
    items = result["items"]

    days = {}
    for entry in items:
        ts = entry.get("airing_at", 0)
        d = datetime.datetime.fromtimestamp(ts).strftime("%A, %b %d") if ts else "TBA"
        days.setdefault(d, []).append(entry)

    return render(request, "uzzutv/aniuzu_schedule.html", {
        "days": days,
        "items": items,
        "view": view,
        "start_date": start_of_week if view == "week" else today,
    })


def aniuzu_genre_list(request):
    """Genre browse page — shows all available genres."""
    return render(request, "uzzutv/aniuzu_genre_list.html", {
        "genres": ANILIST_GENRES,
    })


def aniuzu_genre(request, genre):
    """Anime filtered by a specific genre with pagination."""
    page = max(1, int(request.GET.get("page", 1)))
    result = anilist_by_genre(genre, page)
    items = result["items"]
    total_pages = result["total_pages"]

    pages = []
    for p in range(1, total_pages + 1):
        if p == 1 or p == total_pages or abs(p - page) <= 2:
            if pages and pages[-1] != "..." and p - 1 != pages[-1]:
                pages.append("...")
            pages.append(p)

    return render(request, "uzzutv/aniuzu_genre.html", {
        "genre": genre,
        "items": items,
        "page": page,
        "total_pages": total_pages,
        "pages": pages,
        "genres": ANILIST_GENRES,
    })