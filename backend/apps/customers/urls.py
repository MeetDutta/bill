from django.urls import path

from . import views

from apps.analytics.views import (
    CustomerChurnDetailView,
    CustomerHealthDetailView,
    CustomerNextActionView,
    CustomerOfferRecommendationView,
    CustomerRFMDetailView,
    CreateRecommendedOfferView,
)

urlpatterns = [
    path("", views.CustomerListView.as_view(), name="customer-list"),
    path("<uuid:pk>/", views.CustomerDetailView.as_view(), name="customer-detail"),
    path("<uuid:pk>/timeline/", views.CustomerTimelineView.as_view(), name="customer-timeline"),
    path("<uuid:pk>/health/", CustomerHealthDetailView.as_view(), name="customer-health"),
    path("<uuid:pk>/churn/", CustomerChurnDetailView.as_view(), name="customer-churn"),
    path("<uuid:pk>/next-action/", CustomerNextActionView.as_view(), name="customer-next-action"),
    path("<uuid:pk>/recommendations/", CustomerOfferRecommendationView.as_view(), name="customer-recommendations"),
    path("<uuid:pk>/create-recommended-offer/", CreateRecommendedOfferView.as_view(), name="customer-create-recommended-offer"),
    path("<uuid:pk>/rfm/", CustomerRFMDetailView.as_view(), name="customer-rfm"),
]

