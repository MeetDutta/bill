from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "notification_type",
            "category",
            "severity",
            "title",
            "message",
            "data",
            "related_entity_type",
            "related_entity_id",
            "audience",
            "is_read",
            "read_at",
            "is_dismissed",
            "dismissed_at",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "read_at",
            "dismissed_at",
            "resolved_at",
        ]
