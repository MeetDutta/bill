from rest_framework import generics

from common.pagination import StandardPagination

from .models import Customer, CustomerTimeline
from .serializers import CustomerListSerializer, CustomerSerializer, CustomerTimelineSerializer


class CustomerListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["first_name", "last_name", "phone", "email", "customer_id"]
    filterset_fields = ["segment", "is_active", "whatsapp_opt_in", "source"]

    def get_queryset(self):
        return Customer.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return CustomerListSerializer
        return CustomerSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class CustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        return Customer.objects.filter(organization=self.request.user.organization)


class CustomerTimelineView(generics.ListAPIView):
    serializer_class = CustomerTimelineSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        return CustomerTimeline.objects.filter(
            customer_id=self.kwargs["pk"],
            organization=self.request.user.organization,
        )
