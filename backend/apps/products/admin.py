from django.contrib import admin

from .models import Product, ProductCategory


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "parent", "is_active")
    search_fields = ("name",)
    list_filter = ("is_active",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "external_id", "sku", "unit_price", "tax_rate", "organization", "is_active")
    search_fields = ("name", "external_id", "sku", "barcode")
    list_filter = ("is_active", "category")
