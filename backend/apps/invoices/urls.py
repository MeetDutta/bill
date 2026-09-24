from django.urls import path

from . import views

urlpatterns = [
    path("", views.InvoiceListView.as_view(), name="invoice-list"),
    path("<uuid:pk>/", views.InvoiceDetailView.as_view(), name="invoice-detail"),
    path("view/<str:token>/", views.InvoicePublicView.as_view(), name="invoice-public"),
]
