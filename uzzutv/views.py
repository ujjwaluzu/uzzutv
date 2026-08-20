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

    cache_key = "index_genre_movies_v2"
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

    data = {}

    used = set()

    for name, gid in genres.items():

        params = {
            "api_key": API_KEY,
            "with_genres": gid,
            "sort_by": "popularity.desc",
            "vote_count.gte": 300
        }

        try:

            response = requests.get(
                f"{BASE_URL}/discover/movie",
                params=params,
                timeout=10
            )

            results = response.json().get("results", [])

            available = [
                m for m in results if m["id"] not in used
            ]

            pick = available[0] if available else None
            pick2 = available[1] if len(available) > 1 else None

            if pick:
                used.add(pick["id"])
            if pick2:
                used.add(pick2["id"])

            data[name] = {
                "poster_path": pick["poster_path"] if pick else None,
                "stack_poster_path": pick2["poster_path"] if pick2 else None
            }

        except Exception:

            data[name] = {
                "poster_path": None,
                "stack_poster_path": None
            }

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

    # add logos for hero
    for item in trending[:5]:

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





def detail(request, type, id):

    cache_key = f"detail_{type}_{id}"
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

        context = {
            "data": data,
            "type": type,
            "title_full": title_full,
            "meta_desc": meta_desc,
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

    cache_key = "sitemap_urls"
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