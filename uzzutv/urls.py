from django.urls import path
from . import views

urlpatterns=[
    path("", views.index, name="index"),
    path("movie/", views.movie, name="movie"),
    path("tv/", views.tv, name="tv"),
    path("tv/<int:tv_id>/watch/", views.watchtv, name="watchtv"),
    path("movie/<int:movie_id>/watch/", views.watchmov, name="watchmov"),
    path("search/", views.search, name="search"),
    path("home/", views.home, name="home"),
    path("<str:type>/<int:id>/", views.detail, name="detail"),
    path("watchlist/", views.watchlist, name="watchlist"),
    path("terms/", views.terms, name="terms"),
    path("dmca/", views.dmca, name="dmca"),

]