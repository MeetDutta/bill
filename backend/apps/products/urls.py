from django.urls import path

from . import views

from apps.analytics.views import (
    ProductAffinityListView,
    ProductBundleListView,
    ProductIntelligenceListView,
)

urlpatterns = [
    path("categories/", views.ProductCategoryListView.as_view(), name="product-category-list"),
    path("affinity/", ProductAffinityListView.as_view(), name="product-affinity"),
    path("bundles/", ProductBundleListView.as_view(), name="product-bundles"),
    path("intelligence/", ProductIntelligenceListView.as_view(), name="product-intelligence"),
    path("", views.ProductListView.as_view(), name="product-list"),
    path("<uuid:pk>/", views.ProductDetailView.as_view(), name="product-detail"),
]

