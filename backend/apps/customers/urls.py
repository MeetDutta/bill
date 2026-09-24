from django.urls import path

from . import views

urlpatterns = [
    path("", views.CustomerListView.as_view(), name="customer-list"),
    path("<uuid:pk>/", views.CustomerDetailView.as_view(), name="customer-detail"),
    path("<uuid:pk>/timeline/", views.CustomerTimelineView.as_view(), name="customer-timeline"),
]
