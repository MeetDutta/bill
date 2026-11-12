from django.db.models import Q
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination

from .models import Customer, CustomerTimeline
from .serializers import CustomerListSerializer, CustomerSerializer, CustomerTimelineSerializer
from .utils import normalize_phone, validate_mobile_number


class CustomerListView(generics.ListCreateAPIView):
    pagination_class = StandardPagination
    search_fields = ["first_name", "last_name", "phone", "email", "customer_id", "gstin", "city"]
    filterset_fields = ["segment", "is_active", "whatsapp_opt_in", "source", "is_walk_in"]

    def get_queryset(self):
        qs = Customer.objects.filter(organization=self.request.user.organization)
        if self.request.method == "GET":
            include_walkin = str(self.request.query_params.get("include_walk_in", "")).lower() in ("1", "true", "yes")
            if not include_walkin:
                qs = qs.filter(is_walk_in=False)
            raw_search = str(self.request.query_params.get("search") or "").strip()
            norm_search = normalize_phone(raw_search)
            if norm_search and norm_search.isdigit() and len(norm_search) >= 4 and norm_search != raw_search:
                # Allow searching "+91 98765-43210" to match normalized stored phone "9876543210"
                self.search_fields = ["first_name", "last_name", "phone", "email", "customer_id", "gstin", "city"]
                qs = qs.filter(
                    Q(phone__icontains=norm_search)
                    | Q(phone__icontains=raw_search)
                    | Q(first_name__icontains=raw_search)
                    | Q(last_name__icontains=raw_search)
                    | Q(email__icontains=raw_search)
                    | Q(customer_id__icontains=raw_search)
                )
        return qs

    def filter_queryset(self, queryset):
        raw_search = str(self.request.query_params.get("search") or "").strip()
        norm_search = normalize_phone(raw_search)
        if self.request.method == "GET" and norm_search and norm_search.isdigit() and len(norm_search) >= 4 and norm_search != raw_search:
            # Skip DRF SearchFilter on raw "+91 ..." string since get_queryset already matched normalized phone
            for backend in list(self.filter_backends):
                if getattr(backend, "__name__", "") == "SearchFilter":
                    continue
                queryset = backend().filter_queryset(self.request, queryset, self)
            return queryset
        return super().filter_queryset(queryset)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return CustomerListSerializer
        return CustomerSerializer

    def perform_create(self, serializer):
        customer = serializer.save(organization=self.request.user.organization)
        from apps.loyalty.models import LoyaltyAccount
        LoyaltyAccount.objects.get_or_create(
            organization=self.request.user.organization,
            customer=customer,
            defaults={"balance": 0, "total_earned": 0, "total_redeemed": 0},
        )
        CustomerTimeline.objects.create(
            organization=self.request.user.organization,
            customer=customer,
            event_type="created",
        )


class CustomerByMobileView(APIView):
    """Lookup a customer in the user's organization by normalized mobile number."""

    def get(self, request, mobile_number: str = ""):
        raw_mobile = mobile_number or request.query_params.get("mobile") or request.query_params.get("phone") or ""
        valid, normalized, err = validate_mobile_number(raw_mobile)
        if not valid:
            raise ValidationError({"mobile_number": err})

        customer = (
            Customer.objects.filter(
                organization=request.user.organization,
                phone=normalized,
                is_walk_in=False,
            )
            .first()
        )
        if not customer:
            # Defensive fallback for any unnormalized legacy rows in DB
            for candidate in Customer.objects.filter(
                organization=request.user.organization,
                is_walk_in=False,
            ).exclude(phone=""):
                if normalize_phone(candidate.phone) == normalized:
                    customer = candidate
                    break

        if customer:
            serializer = CustomerSerializer(customer, context={"request": request})
            return Response(
                {
                    "exists": True,
                    "normalized_mobile": normalized,
                    "customer": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "exists": False,
                "normalized_mobile": normalized,
                "customer": None,
            },
            status=status.HTTP_200_OK,
        )


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
