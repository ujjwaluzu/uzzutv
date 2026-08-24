from django.urls import path

from . import views

app_name = "aniuzu"

urlpatterns = [
    path("", views.home, name="home"),
    path("trending/", views.browse, kwargs={"section": "trending"}, name="trending"),
    path("popular/", views.browse, kwargs={"section": "popular"}, name="popular"),
    path("airing/", views.browse, kwargs={"section": "airing"}, name="airing"),
    path("search/", views.search, name="search"),
    path("anime/<int:anime_id>/", views.detail, name="detail"),
    path("watch/<int:anime_id>/<int:episode>/", views.watch, name="watch"),
]
