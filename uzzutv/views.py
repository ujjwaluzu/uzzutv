from django.shortcuts import render
from django.http import HttpResponse
from django.core.cache import cache
import requests

API_KEY = "4d04b1722277e2f2e0119b4c6cdaa1d6"
BASE_URL = "https://api.themoviedb.org/3"

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
    return render(request, "uzzutv/index.html")


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

    logo = logos[0]["file_path"] if logos else None

    cache.set(cache_key, logo, 86400)

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

    logo = logos[0]["file_path"] if logos else None

    cache.set(cache_key, logo, 86400)

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

def home(request):

    data = load_homepage_data()

    return render(request, "uzzutv/home.html", {
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

    # -----------------------------
    # PLAYER URL
    # -----------------------------

    stream_url = f"https://vidsrcme.ru/embed/tv?imdb={imdb}&season={season}&episode={episode}&ds_lang=en&autoplay=1"

    return render(request, "uzzutv/watchtv.html", {
        "id": tv_id,
        "url": stream_url,
        "imdb": imdb,
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
    # PLAYER URL
    # -----------------------------

    stream_url = f"https://vidsrcme.ru/embed/movie?imdb={imdb}&ds_lang=en&autoplay=1"

    return render(request, "uzzutv/watchmov.html", {
        "url": stream_url
    })