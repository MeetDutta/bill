from django.urls import path

from . import views

urlpatterns = [
    path("", views.UserListView.as_view(), name="user-list"),
    path("create/", views.UserCreateView.as_view(), name="user-create"),
    path("<uuid:pk>/", views.UserDetailView.as_view(), name="user-detail"),
]
