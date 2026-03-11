from django.shortcuts import render




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
def watchtv(request, tv_id):
    return render(request, "uzzutv/watchtv.html",{
        "id": tv_id
    })