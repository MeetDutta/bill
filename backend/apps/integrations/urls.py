from django.urls import path

from . import views

urlpatterns = [
    path("", views.IntegrationListView.as_view(), name="integration-list"),
    path("<uuid:pk>/", views.IntegrationDetailView.as_view(), name="integration-detail"),
    path("logs/", views.IntegrationLogListView.as_view(), name="integration-log-list"),
]
