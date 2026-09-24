from rest_framework import serializers

from .models import Integration, IntegrationLog


class IntegrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Integration
        fields = [
            "id", "name", "integration_type", "api_key", "webhook_url",
            "config", "is_active", "last_sync_at", "organization", "created_at",
        ]
        read_only_fields = ["id", "last_sync_at", "created_at", "organization"]
        extra_kwargs = {"api_secret": {"write_only": True}}


class IntegrationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationLog
        fields = ["id", "integration", "event_type", "status", "error_message", "created_at"]
        read_only_fields = ["id", "created_at"]
