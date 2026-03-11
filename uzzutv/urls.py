from django.urls import path
from . import views

urlpatterns=[
    path("", views.index, name="index"),
    path("home/", views.home, name="home"),
    path("tv/", views.tv, name="tv"),
    path("tv/<int:tv_id>/", views.watchtv, name="watchtv"),
    path("superembed/", views.superembed, name="superembed")
]