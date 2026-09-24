from rest_framework import generics

from common.pagination import StandardPagination

from .models import Organization
from .serializers import OrganizationListSerializer, OrganizationSerializer


class OrganizationListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name", "legal_name", "email"]

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Organization.objects.all()
        return Organization.objects.filter(id=self.request.user.organization_id)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return OrganizationListSerializer
        return OrganizationSerializer


class OrganizationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Organization.objects.all()
        return Organization.objects.filter(id=self.request.user.organization_id)
