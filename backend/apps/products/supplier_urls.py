from django.urls import path
from . import views

urlpatterns = [
    path("", views.SupplierListView.as_view(), name="root-supplier-list"),
    path("<uuid:pk>/", views.SupplierDetailView.as_view(), name="root-supplier-detail"),
    path("<uuid:supplier_id>/purchases/", views.SupplierPurchasesView.as_view(), name="root-supplier-purchases"),
]
