from django.contrib import admin

from .models import CustomerInsight, AIContentGeneration, AISegmentation


@admin.register(AIContentGeneration)
class AIContentGenerationAdmin(admin.ModelAdmin):
    list_display = ("content_type", "status", "model_used", "tokens_used", "created_at")
    list_filter = ("content_type", "status")


@admin.register(CustomerInsight)
class CustomerInsightAdmin(admin.ModelAdmin):
    list_display = ("customer", "insight_type", "score", "model_version", "created_at")
    list_filter = ("insight_type",)


@admin.register(AISegmentation)
class AISegmentationAdmin(admin.ModelAdmin):
    list_display = ("name", "customer_count", "is_auto_generated", "last_calculated_at")
    list_filter = ("is_auto_generated",)
