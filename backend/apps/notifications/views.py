from rest_framework import generics

from common.pagination import StandardPagination

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    pagination_class = StandardPagination
    filterset_fields = ["notification_type", "is_read"]

    def get_queryset(self):
        return Notification.objects.filter(
            user=self.request.user,
            organization=self.request.user.organization,
        )
