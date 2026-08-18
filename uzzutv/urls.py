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
    path("party/", views.party, name="party"),
    path("party/<str:room_code>/", views.party_room, name="party_room"),
    path("<str:type>/<int:id>/", views.detail, name="detail"),
    path("watchlist/", views.watchlist, name="watchlist"),
path("rated/", views.rated, name="rated"),
path("rated/<uuid:user_id>/", views.rated, name="rated_user"),
    path("terms/", views.terms, name="terms"),
    path("dmca/", views.dmca, name="dmca"),
    path("auth/", views.auth, name="auth"),
    path("profile/", views.profile, name="profile"),
    path("profile/<uuid:user_id>/", views.public_profile, name="public_profile"),
    path("media-info/<str:type>/<int:id>/", views.media_info, name="media_info"),
    path("robots.txt", views.robots_txt, name="robots_txt"),
    path("sitemap.xml", views.sitemap_xml, name="sitemap_xml"),


]