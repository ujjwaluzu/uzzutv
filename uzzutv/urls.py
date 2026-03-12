from django.urls import path
from . import views

urlpatterns=[
    path("", views.index, name="index"),
    path("movie/", views.home, name="home"),
    path("tv/", views.tv, name="tv"),
    path("tv/<int:tv_id>/", views.watchtv, name="watchtv"),
    path("movie/<int:movie_id>/", views.watchmov, name="watchmov"),
    path("search/", views.search, name="search")

]