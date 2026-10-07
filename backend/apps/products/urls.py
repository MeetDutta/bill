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
    path("suppliers/", views.SupplierListView.as_view(), name="supplier-list"),
    path("suppliers/<uuid:pk>/", views.SupplierDetailView.as_view(), name="supplier-detail"),
    path("suppliers/<uuid:supplier_id>/purchases/", views.SupplierPurchasesView.as_view(), name="supplier-purchases"),
    path("", views.ProductListView.as_view(), name="product-list"),
    path("<uuid:pk>/", views.ProductDetailView.as_view(), name="product-detail"),
]

