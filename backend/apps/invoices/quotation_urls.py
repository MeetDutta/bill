from django.urls import path
from . import views

urlpatterns = [
    path("", views.QuotationListView.as_view(), name="root-quotation-list"),
    path("<uuid:pk>/", views.QuotationDetailView.as_view(), name="root-quotation-detail"),
    path("<uuid:pk>/convert/", views.QuotationConvertView.as_view(), name="root-quotation-convert"),
]
