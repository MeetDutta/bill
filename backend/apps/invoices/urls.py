from django.urls import path
from . import views

urlpatterns = [
    path("quotations/", views.QuotationListView.as_view(), name="quotation-list"),
    path("quotations/<uuid:pk>/", views.QuotationDetailView.as_view(), name="quotation-detail"),
    path("quotations/<uuid:pk>/convert/", views.QuotationConvertView.as_view(), name="quotation-convert"),
    path("view/<str:token>/", views.InvoicePublicView.as_view(), name="invoice-public"),
    path("<uuid:pk>/pdf/", views.InvoicePDFView.as_view(), name="invoice-pdf"),
    path("<uuid:pk>/", views.InvoiceDetailView.as_view(), name="invoice-detail"),
    path("", views.InvoiceListView.as_view(), name="invoice-list"),
]
