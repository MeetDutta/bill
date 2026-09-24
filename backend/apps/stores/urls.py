from django.urls import path

from . import views

urlpatterns = [
    path("", views.StoreListView.as_view(), name="store-list"),
    path("<uuid:pk>/", views.StoreDetailView.as_view(), name="store-detail"),
]
