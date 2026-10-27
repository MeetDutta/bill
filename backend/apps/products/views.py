from rest_framework import generics

from common.pagination import StandardPagination

from .models import Product, ProductCategory
from .serializers import ProductCategorySerializer, ProductListSerializer, ProductSerializer


class ProductCategoryListView(generics.ListCreateAPIView):
    serializer_class = ProductCategorySerializer
    pagination_class = StandardPagination
    search_fields = ["name"]

    def get_queryset(self):
        qs = ProductCategory.objects.filter(organization=self.request.user.organization)
        active_only = self.request.query_params.get("active_only")
        if active_only and active_only.lower() in ("true", "1"):
            qs = qs.filter(is_active=True)
        return qs.order_by("name")

    @property
    def paginator(self):
        if self.request.query_params.get("all") in ("true", "1", "yes"):
            return None
        return super().paginator

    def perform_create(self, serializer):
        category = serializer.save(organization=self.request.user.organization)
        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=category.organization,
                event_type="category_created",
                payload={"category_id": str(category.id), "name": category.name},
            )
        except Exception:
            pass


class ProductListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name", "external_id", "sku", "barcode"]
    filterset_fields = ["category", "is_active"]

    def get_queryset(self):
        return Product.objects.filter(organization=self.request.user.organization).order_by("name")

    def get_serializer_class(self):
        if self.request.method == "GET":
            return ProductListSerializer
        return ProductSerializer

    def perform_create(self, serializer):
        product = serializer.save(organization=self.request.user.organization)
        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=product.organization,
                event_type="product_created",
                payload={"product_id": str(product.id), "name": product.name},
            )
        except Exception:
            pass


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        return Product.objects.filter(organization=self.request.user.organization)

    def perform_update(self, serializer):
        product = serializer.save()
        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=product.organization,
                event_type="product_updated",
                payload={"product_id": str(product.id), "name": product.name},
            )
        except Exception:
            pass

    def perform_destroy(self, instance):
        org = instance.organization
        prod_id = str(instance.id)
        prod_name = instance.name
        instance.delete()
        try:
            from apps.billing.services.realtime_service import RealtimeService
            RealtimeService.publish_event(
                organization=org,
                event_type="product_deleted",
                payload={"product_id": prod_id, "name": prod_name},
            )
        except Exception:
            pass


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
