from rest_framework import generics

from common.pagination import StandardPagination

from .models import Automation, AutomationExecution
from .serializers import AutomationExecutionSerializer, AutomationListSerializer, AutomationSerializer


class AutomationListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name"]
    filterset_fields = ["trigger", "action", "is_active"]

    def get_queryset(self):
        return Automation.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return AutomationListSerializer
        return AutomationSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class AutomationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AutomationSerializer

    def get_queryset(self):
        return Automation.objects.filter(organization=self.request.user.organization)


class AutomationExecutionListView(generics.ListAPIView):
    serializer_class = AutomationExecutionSerializer
    pagination_class = StandardPagination
    filterset_fields = ["status", "automation"]

    def get_queryset(self):
        return AutomationExecution.objects.filter(
            organization=self.request.user.organization
        ).select_related("automation", "customer")
