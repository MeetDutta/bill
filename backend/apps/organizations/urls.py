from django.urls import path

from . import views

urlpatterns = [
    path("", views.OrganizationListView.as_view(), name="organization-list"),
    path("<uuid:pk>/", views.OrganizationDetailView.as_view(), name="organization-detail"),
]
