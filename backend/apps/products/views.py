from rest_framework import generics

from common.pagination import StandardPagination

from .models import Product, ProductCategory
from .serializers import ProductCategorySerializer, ProductListSerializer, ProductSerializer


class ProductCategoryListView(generics.ListCreateAPIView):
    serializer_class = ProductCategorySerializer
    pagination_class = StandardPagination
    search_fields = ["name"]

    def get_queryset(self):
        return ProductCategory.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class ProductListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name", "external_id", "sku", "barcode"]
    filterset_fields = ["category", "is_active"]

    def get_queryset(self):
        return Product.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return ProductListSerializer
        return ProductSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        return Product.objects.filter(organization=self.request.user.organization)
