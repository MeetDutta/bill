from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import Campaign, CampaignMessage
from .serializers import (
    CampaignListSerializer,
    CampaignMessageSerializer,
    CampaignSerializer,
    SendCampaignSerializer,
)
from .tasks import process_campaign_task


class CampaignListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["name"]
    filterset_fields = ["campaign_type", "status"]

    def get_queryset(self):
        return Campaign.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return CampaignListSerializer
        return CampaignSerializer

    def perform_create(self, serializer):
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user,
        )


class CampaignDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CampaignSerializer

    def get_queryset(self):
        return Campaign.objects.filter(organization=self.request.user.organization)


class CampaignMessageListView(generics.ListAPIView):
    serializer_class = CampaignMessageSerializer
    pagination_class = StandardPagination
    filterset_fields = ["status"]

    def get_queryset(self):
        return CampaignMessage.objects.filter(
            organization=self.request.user.organization,
            campaign_id=self.kwargs.get("campaign_pk"),
        ).select_related("customer")


class SendCampaignView(APIView):
    def post(self, request, pk):
        try:
            campaign = Campaign.objects.get(
                id=pk,
                organization=request.user.organization,
            )
        except Campaign.DoesNotExist:
            return Response({"error": "Campaign not found"}, status=status.HTTP_404_NOT_FOUND)

        if campaign.status != "draft":
            return Response(
                {"error": "Campaign already sent or in progress"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campaign.status = "scheduled"
        campaign.save(update_fields=["status"])

        process_campaign_task.delay(str(campaign.id))

        return Response({"message": "Campaign processing started", "campaign_id": str(campaign.id)})


class CampaignPreviewView(APIView):
    def post(self, request, pk):
        try:
            campaign = Campaign.objects.get(
                id=pk,
                organization=request.user.organization,
            )
        except Campaign.DoesNotExist:
            return Response({"error": "Campaign not found"}, status=status.HTTP_404_NOT_FOUND)

        from apps.customers.models import Customer
        customers = Customer.objects.filter(
            organization=request.user.organization,
            is_active=True,
            whatsapp_opt_in=True,
        )
        if campaign.segment_rules:
            for key, value in campaign.segment_rules.items():
                if key == "segment":
                    customers = customers.filter(segment=value)
                elif key == "min_total_spend":
                    customers = customers.filter(total_spend__gte=value)
                elif key == "max_days_since_purchase":
                    from django.utils import timezone
                    cutoff = timezone.now() - timezone.timedelta(days=value)
                    customers = customers.filter(last_purchase_at__gte=cutoff)

        return Response({
            "total_recipients": customers.count(),
            "sample_customers": [
                {"name": c.full_name, "phone": c.phone}
                for c in customers[:5]
            ],
        })
