from rest_framework import generics, permissions

from common.pagination import StandardPagination

from .models import Invoice
from .serializers import InvoiceListSerializer, InvoiceSerializer, PublicInvoiceSerializer


class InvoiceListView(generics.ListAPIView):
    serializer_class = InvoiceListSerializer
    pagination_class = StandardPagination
    search_fields = ["invoice_number"]

    def get_queryset(self):
        return Invoice.objects.filter(organization=self.request.user.organization)


class InvoiceDetailView(generics.RetrieveAPIView):
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return Invoice.objects.filter(organization=self.request.user.organization)


class InvoicePublicView(generics.RetrieveAPIView):
    serializer_class = PublicInvoiceSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        from django.shortcuts import get_object_or_404
        token = self.kwargs.get("token")
        invoice = get_object_or_404(
            Invoice.objects.select_related(
                "organization",
                "transaction__store",
                "transaction__customer",
            ).prefetch_related("transaction__items"),
            secure_token=token,
        )
        if not invoice.is_viewed:
            invoice.is_viewed = True
            from django.utils import timezone
            invoice.viewed_at = timezone.now()
            invoice.save(update_fields=["is_viewed", "viewed_at"])
        return invoice
