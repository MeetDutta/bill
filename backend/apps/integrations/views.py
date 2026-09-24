from rest_framework import generics

from common.pagination import StandardPagination

from .models import Integration, IntegrationLog
from .serializers import IntegrationLogSerializer, IntegrationSerializer


class IntegrationListView(generics.ListCreateAPIView):
    serializer_class = IntegrationSerializer
    pagination_class = StandardPagination
    filterset_fields = ["integration_type", "is_active"]

    def get_queryset(self):
        return Integration.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class IntegrationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = IntegrationSerializer

    def get_queryset(self):
        return Integration.objects.filter(organization=self.request.user.organization)


class IntegrationLogListView(generics.ListAPIView):
    serializer_class = IntegrationLogSerializer
    pagination_class = StandardPagination
    filterset_fields = ["integration", "status"]

    def get_queryset(self):
        return IntegrationLog.objects.filter(organization=self.request.user.organization)
