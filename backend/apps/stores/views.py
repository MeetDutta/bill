from rest_framework import generics

from common.pagination import StandardPagination

from .models import Store
from .serializers import StoreListSerializer, StoreSerializer


class StoreListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name", "code"]
    filterset_fields = ["status"]

    def get_queryset(self):
        return Store.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return StoreListSerializer
        return StoreSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class StoreDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = StoreSerializer

    def get_queryset(self):
        return Store.objects.filter(organization=self.request.user.organization)
