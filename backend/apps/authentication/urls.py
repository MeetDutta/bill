from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("register/", views.RegisterView.as_view(), name="register"),
    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("profile/", views.ProfileView.as_view(), name="profile"),
]
