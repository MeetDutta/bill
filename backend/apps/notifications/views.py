from django.db.models import Q, Count
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import StandardPagination
from .models import Notification
from .serializers import NotificationSerializer

ADMIN_ROLES = ["super_admin", "org_admin", "owner", "store_manager", "manager"]


def get_user_notifications_queryset(user):
    """
    Returns the notification queryset filtered by organization and role permissions.
    """
    if not user or not user.is_authenticated:
        return Notification.objects.none()

    org = getattr(user, "organization", None)
    if not org:
        return Notification.objects.none()

    qs = Notification.objects.filter(organization=org)

    role = getattr(user, "role", "cashier")
    if role in ADMIN_ROLES:
        # Admins can see all organizational notifications, except specific private notifications for other users
        qs = qs.filter(Q(user=user) | Q(user__isnull=True) | ~Q(audience="user"))
    else:
        # Staff can only see audience in ['all', 'staff'] or explicitly addressed to them
        qs = qs.filter(Q(audience__in=["all", "staff"]) | Q(user=user))

    return qs


class NotificationListView(generics.ListAPIView):
    """
    Paginated, searchable, and filterable list of notifications.
    """
    serializer_class = NotificationSerializer
    pagination_class = StandardPagination
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_user_notifications_queryset(self.request.user)

        # By default exclude dismissed unless explicitly requested
        is_dismissed = self.request.query_params.get("is_dismissed")
        if is_dismissed is not None:
            if is_dismissed.lower() in ["true", "1"]:
                qs = qs.filter(is_dismissed=True)
            elif is_dismissed.lower() in ["false", "0"]:
                qs = qs.filter(is_dismissed=False)
        else:
            qs = qs.filter(is_dismissed=False)

        category = self.request.query_params.get("category")
        if category and category.lower() != "all":
            qs = qs.filter(category=category.lower())

        severity = self.request.query_params.get("severity")
        if severity and severity.lower() != "all":
            qs = qs.filter(severity=severity.lower())

        is_read = self.request.query_params.get("is_read")
        if is_read is not None:
            if is_read.lower() in ["true", "1"]:
                qs = qs.filter(is_read=True)
            elif is_read.lower() in ["false", "0"]:
                qs = qs.filter(is_read=False)

        active_low_stock = self.request.query_params.get("active_low_stock")
        if active_low_stock is not None and active_low_stock.lower() in ["true", "1"]:
            qs = qs.filter(category="inventory", resolved_at__isnull=True)

        search = self.request.query_params.get("search")
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(message__icontains=search)
                | Q(related_entity_id__icontains=search)
            )

        return qs.order_by("-created_at")


class NotificationSummaryView(APIView):
    """
    Returns counts for Total, Unread, Critical, and Active Low-Stock alerts.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        base_qs = get_user_notifications_queryset(request.user).filter(is_dismissed=False)

        total = base_qs.count()
        unread = base_qs.filter(is_read=False).count()
        critical = base_qs.filter(severity="critical").count()
        active_low_stock = base_qs.filter(
            category="inventory",
            resolved_at__isnull=True,
            data__alert_type__in=["warning", "critical", "out_of_stock"],
        ).count()

        # Breakdown by category
        cat_counts = {}
        for cat in ["inventory", "sales", "payments", "invoices", "system"]:
            cat_counts[cat] = base_qs.filter(category=cat).count()

        return Response({
            "total": total,
            "unread": unread,
            "critical": critical,
            "active_low_stock": active_low_stock,
            "categories": cat_counts,
        })


class NotificationMarkReadView(APIView):
    """
    Marks a single notification as read.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        qs = get_user_notifications_queryset(request.user)
        try:
            notification = qs.get(id=pk)
        except Notification.DoesNotExist:
            return Response({"error": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)

        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=["is_read", "read_at"])

        return Response(NotificationSerializer(notification).data)


class NotificationMarkUnreadView(APIView):
    """
    Marks a single notification as unread.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        qs = get_user_notifications_queryset(request.user)
        try:
            notification = qs.get(id=pk)
        except Notification.DoesNotExist:
            return Response({"error": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)

        notification.is_read = False
        notification.read_at = None
        notification.save(update_fields=["is_read", "read_at"])

        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    """
    Marks all notifications matching the user's view as read.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        qs = get_user_notifications_queryset(request.user).filter(is_read=False, is_dismissed=False)
        category = request.data.get("category")
        if category and category.lower() != "all":
            qs = qs.filter(category=category.lower())

        count = qs.update(is_read=True, read_at=timezone.now())
        return Response({"status": "success", "marked_read_count": count})


class NotificationDismissView(APIView):
    """
    Dismisses / archives a notification.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        qs = get_user_notifications_queryset(request.user)
        try:
            notification = qs.get(id=pk)
        except Notification.DoesNotExist:
            return Response({"error": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)

        notification.is_dismissed = True
        notification.dismissed_at = timezone.now()
        notification.save(update_fields=["is_dismissed", "dismissed_at"])

        return Response({"status": "success", "id": str(notification.id), "is_dismissed": True})
