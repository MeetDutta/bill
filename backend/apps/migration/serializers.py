from rest_framework import serializers
from apps.migration.models import POSMigrationJob
from apps.migration.services.pos_migration_service import POSMigrationService


class POSMigrationJobSerializer(serializers.ModelSerializer):
    target_fields = serializers.SerializerMethodField()
    suggested_mapping = serializers.SerializerMethodField()

    class Meta:
        model = POSMigrationJob
        fields = [
            "id",
            "file_name",
            "entity_type",
            "status",
            "duplicate_strategy",
            "raw_headers",
            "sample_rows",
            "column_mapping",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "duplicate_rows",
            "new_items_count",
            "imported_count",
            "skipped_count",
            "failed_count",
            "validation_errors",
            "import_report",
            "error_message",
            "target_fields",
            "suggested_mapping",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "raw_headers",
            "sample_rows",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "duplicate_rows",
            "new_items_count",
            "imported_count",
            "skipped_count",
            "failed_count",
            "validation_errors",
            "import_report",
            "error_message",
            "target_fields",
            "suggested_mapping",
            "created_at",
            "updated_at",
        ]

    def get_target_fields(self, obj):
        return POSMigrationService.TARGET_FIELDS.get(obj.entity_type, [])

    def get_suggested_mapping(self, obj):
        if obj.raw_headers:
            return POSMigrationService.suggest_column_mapping(obj.raw_headers, obj.entity_type)
        return {}


class POSMigrationUploadSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)
    entity_type = serializers.ChoiceField(choices=POSMigrationJob.ENTITY_CHOICES, default="products")
    duplicate_strategy = serializers.ChoiceField(choices=POSMigrationJob.DUPLICATE_STRATEGIES, default="skip")


class POSMigrationValidateSerializer(serializers.Serializer):
    column_mapping = serializers.DictField(required=True)
    duplicate_strategy = serializers.ChoiceField(choices=POSMigrationJob.DUPLICATE_STRATEGIES, default="skip")
