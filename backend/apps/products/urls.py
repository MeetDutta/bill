from django.urls import path

from . import views

urlpatterns = [
    path("categories/", views.ProductCategoryListView.as_view(), name="product-category-list"),
    path("", views.ProductListView.as_view(), name="product-list"),
    path("<uuid:pk>/", views.ProductDetailView.as_view(), name="product-detail"),
]
