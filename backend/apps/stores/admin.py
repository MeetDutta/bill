from django.contrib import admin

from .models import Store


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "organization", "status", "manager")
    search_fields = ("name", "code")
    list_filter = ("status", "organization")
