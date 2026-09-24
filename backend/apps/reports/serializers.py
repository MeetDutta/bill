from rest_framework import serializers


class ReportRequestSerializer(serializers.Serializer):
    report_type = serializers.ChoiceField(choices=["sales", "customers", "campaigns", "loyalty"])
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    store_id = serializers.UUIDField(required=False)
