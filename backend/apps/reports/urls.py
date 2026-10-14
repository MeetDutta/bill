from django.urls import path
from . import views

urlpatterns = [
    path("generate/", views.ReportGenerateView.as_view(), name="report-generate"),

    # System Health
    path("system-health/", views.SystemHealthView.as_view(), name="report-system-health"),

    # Financial Reconciliation
    path("reconciliation/financial/", views.FinancialReconciliationView.as_view(), name="reconciliation-financial"),
    path("reconciliation/financial/run/", views.FinancialReconciliationRunView.as_view(), name="reconciliation-financial-run"),
    path("reconciliation/financial/export/", views.FinancialReconciliationExportView.as_view(), name="reconciliation-financial-export"),

    # Inventory Reconciliation
    path("reconciliation/inventory/", views.InventoryReconciliationView.as_view(), name="reconciliation-inventory"),
    path("reconciliation/inventory/run/", views.InventoryReconciliationRunView.as_view(), name="reconciliation-inventory-run"),
    path("reconciliation/inventory/export/", views.InventoryReconciliationExportView.as_view(), name="reconciliation-inventory-export"),

    # Backup Monitoring
    path("backups/status/", views.BackupStatusView.as_view(), name="report-backups-status"),

    # Daily Business Closing
    path("daily-closing/", views.DailyClosingReportView.as_view(), name="report-daily-closing"),
    path("daily-closing/finalize/", views.DailyClosingFinalizeView.as_view(), name="report-daily-closing-finalize"),
]
