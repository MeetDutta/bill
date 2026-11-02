from rest_framework import generics

from common.pagination import StandardPagination

from .models import Store
from .serializers import StoreListSerializer, StoreSerializer


class StoreListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name", "code"]
    filterset_fields = ["status"]

    def get_queryset(self):
        org = self.request.user.organization
        if not org:
            from apps.organizations.models import Organization
            org = Organization.objects.first()
            if not org:
                org = Organization.objects.create(name="BillMeet Store")
            self.request.user.organization = org
            self.request.user.save(update_fields=["organization"])

        qs = Store.objects.filter(organization=org)
        if not qs.exists():
            Store.objects.create(
                organization=org,
                name=f"{org.name} Main Store",
                code="STR-MAIN",
                status="active",
            )
            qs = Store.objects.filter(organization=org)
        return qs

    def get_serializer_class(self):
        if self.request.method == "GET":
            return StoreListSerializer
        return StoreSerializer

    def perform_create(self, serializer):
        org = self.request.user.organization
        if not org:
            from apps.organizations.models import Organization
            org = Organization.objects.first() or Organization.objects.create(name="BillMeet Store")
            self.request.user.organization = org
            self.request.user.save(update_fields=["organization"])
        serializer.save(organization=org)


class StoreDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = StoreSerializer

    def get_queryset(self):
        org = self.request.user.organization
        if not org:
            from apps.organizations.models import Organization
            org = Organization.objects.first()
            if org:
                self.request.user.organization = org
                self.request.user.save(update_fields=["organization"])
        return Store.objects.filter(organization=org) if org else Store.objects.none()
