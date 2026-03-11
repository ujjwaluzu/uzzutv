from django.shortcuts import render
from django.http import HttpResponse
from django.shortcuts import redirect



import requests

API_KEY = "4d04b1722277e2f2e0119b4c6cdaa1d6"
# Create your views here.
def index(request):
    return render(request, "uzzutv/index.html")




# for trending movies
def trendingMovie():
    url = "https://api.themoviedb.org/3/trending/movie/day"
    params = {"api_key": API_KEY}

    response = requests.get(url, params=params)
    data = response.json()

    return data["results"]


# for popular moveis
def popularMovie():
    url = "https://api.themoviedb.org/3/movie/popular"
    params = {"api_key": API_KEY}
    response = requests.get(url, params=params)
    data = response.json()

    return data["results"]
# for top rated movies
def topMovie():
    url = "https://api.themoviedb.org/3/movie/top_rated"
    params = {"api_key": API_KEY}
    response = requests.get(url, params=params)
    data = response.json()

    return data["results"]


def popular_tv():
    url = "https://api.themoviedb.org/3/tv/popular"
    params = {"api_key": API_KEY}
    response = requests.get(url, params=params)
    data = response.json()

    return data["results"]

def trending_tv():
    url = "https://api.themoviedb.org/3/trending/tv/day"
    params = {"api_key": API_KEY}
    response = requests.get(url, params=params)
    data = response.json()

    return data["results"]

def toprated_tv():
    url = "https://api.themoviedb.org/3/tv/top_rated"
    params = {"api_key": API_KEY}
    response = requests.get(url, params=params)
    data = response.json()

    return data["results"]
def home(request):
    
    return render(request, "uzzutv/home.html",{
        "popularMovie": popularMovie(),
        "trendingMovie": trendingMovie(),
        "toprated": topMovie()
    })
def tv(request):
    return render(request, "uzzutv/tv.html",{
        "populartv": popular_tv(),
        "trendingtv": trending_tv(),
        "topratedtv": toprated_tv()
    })
import requests

def watchtv(request, tv_id):

    season = request.GET.get("season", 1)
    episode = request.GET.get("episode", 1)

    params = {"api_key": API_KEY}

    # get imdb id
    external = requests.get(
        f"https://api.themoviedb.org/3/tv/{tv_id}/external_ids",
        params=params
    ).json()

    imdb = external["imdb_id"]

    # tv details
    tv = requests.get(
        f"https://api.themoviedb.org/3/tv/{tv_id}",
        params=params
    ).json()

    seasons = tv["seasons"]

    # season episodes
    season_data = requests.get(
        f"https://api.themoviedb.org/3/tv/{tv_id}/season/{season}",
        params=params
    ).json()

    episodes = season_data["episodes"]

    # player
    stream_url = f"https://vidsrcme.ru/embed/tv?imdb={imdb}&season={season}&episode={episode}"

    return render(request, "uzzutv/watchtv.html", {
        "id": tv_id,
        "url": stream_url,
        "imdb":imdb,
        "seasons": seasons,
        "episodes": episodes,
        "current_season": int(season),
        "current_episode": int(episode)
    })


def superembed(request):

    video_id = request.GET.get("video_id")
    season = request.GET.get("s", 0)
    episode = request.GET.get("e", 0)

    if not video_id:
        return HttpResponse("Missing video_id")

    request_url = f"https://getsuperembed.link/?video_id={video_id}&season={season}&episode={episode}"

    r = requests.get(
        request_url,
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=10
    )

    player_url = r.text.strip()

    if player_url.startswith("https://"):

        return HttpResponse(f"""
        <html>
        <body style="margin:0">
        <iframe src="{player_url}"
        width="100%"
        height="100%"
        frameborder="0"
        allowfullscreen>
        </iframe>
        </body>
        </html>
        """)

    return HttpResponse(player_url)



# def superembed(request):

#     video_id = request.GET.get("video_id")
#     season = request.GET.get("s", 0)
#     episode = request.GET.get("e", 0)

#     if not video_id:
#         return HttpResponse("Missing video_id")

#     request_url = f"https://getsuperembed.link/?video_id={video_id}&season={season}&episode={episode}"

#     try:
#         r = requests.get(
#             request_url,
#             headers={
#                 "User-Agent": "Mozilla/5.0",
#                 "Referer": "https://getsuperembed.link/"
#             },
#             timeout=7
#         )

#         player_url = r.text.strip()

#         if player_url.startswith("https://"):
#             return redirect(player_url)
#         else:
#             return HttpResponse(player_url)

#     except Exception as e:
#         return HttpResponse("Server error")