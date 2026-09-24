from django.urls import path

from . import views

urlpatterns = [
    path("", views.TransactionListView.as_view(), name="transaction-list"),
    path("<uuid:pk>/", views.TransactionDetailView.as_view(), name="transaction-detail"),
    path("ingest/", views.TransactionIngestView.as_view(), name="transaction-ingest"),
]
