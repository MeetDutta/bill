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


class SupplierListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name", "contact_person", "phone", "gstin", "email"]
    filterset_fields = ["is_active"]

    def get_serializer_class(self):
        from .serializers import SupplierSerializer
        return SupplierSerializer

    def get_queryset(self):
        from .models import Supplier
        return Supplier.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class SupplierDetailView(generics.RetrieveUpdateDestroyAPIView):
    def get_serializer_class(self):
        from .serializers import SupplierSerializer
        return SupplierSerializer

    def get_queryset(self):
        from .models import Supplier
        return Supplier.objects.filter(organization=self.request.user.organization)

    def perform_destroy(self, instance):
        # Soft-delete by marking inactive
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class SupplierPurchasesView(generics.ListAPIView):
    pagination_class = StandardPagination

    def get_serializer_class(self):
        from apps.billing.serializers import PurchaseOrderSerializer
        return PurchaseOrderSerializer

    def get_queryset(self):
        from .models import PurchaseOrder
        supplier_id = self.kwargs.get("supplier_id")
        return PurchaseOrder.objects.filter(
            organization=self.request.user.organization,
            supplier_ref_id=supplier_id,
        ).order_by("-created_at")
