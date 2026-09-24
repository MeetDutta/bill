from rest_framework import serializers

from .models import Automation, AutomationExecution


class AutomationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Automation
        fields = [
            "id", "name", "trigger", "conditions", "delay_hours",
            "action", "action_config", "is_active", "execution_count",
            "last_executed_at", "organization", "created_at",
        ]
        read_only_fields = ["id", "execution_count", "last_executed_at", "created_at", "organization"]


class AutomationListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Automation
        fields = [
            "id", "name", "trigger", "action", "is_active",
            "execution_count", "last_executed_at",
        ]


class AutomationExecutionSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    automation_name = serializers.CharField(source="automation.name", read_only=True)

    class Meta:
        model = AutomationExecution
        fields = [
            "id", "automation", "automation_name", "customer", "customer_name",
            "status", "trigger_data", "result_data", "error_message",
            "executed_at", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
