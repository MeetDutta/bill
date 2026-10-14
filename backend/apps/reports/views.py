import logging
from decimal import Decimal
from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.stores.models import Store
from .services.health_service import SystemHealthService
from .services.financial_reconciliation import FinancialReconciliationService
from .services.inventory_reconciliation import InventoryReconciliationService
from .services.backup_service import BackupService
from .services.daily_closing import DailyBusinessClosingService

logger = logging.getLogger(__name__)


class IsManagementOrAdmin(permissions.BasePermission):
    """
    Ensures only organization admins or store managers can export sensitive financial
    reconciliation data or approve daily cash drawer closings.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ["super_admin", "org_admin", "store_manager"]
        )


class ReportGenerateView(APIView):
    def post(self, request):
        return Response({"message": "Report generation queued", "status": "pending"})


class SystemHealthView(APIView):
    """
    Authenticated Administrator System Health Endpoint:
    Provides granular visibility into database latency, broker connectivity,
    schema migrations, backup readiness, and financial/inventory ledger integrity.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = SystemHealthService.get_full_system_health(request.user.organization)
        return Response(data)


class FinancialReconciliationView(APIView):
    """
    Returns latest financial reconciliation status and discrepancies list.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        store_id = request.query_params.get("store")
        store = None
        if store_id:
            store = Store.objects.filter(organization=request.user.organization, id=store_id).first()

        result = FinancialReconciliationService.run_reconciliation(
            organization=request.user.organization,
            store=store,
            emit_alerts=False,
        )
        return Response(result)


class FinancialReconciliationRunView(APIView):
    """
    Triggers an on-demand financial reconciliation and emits operational alerts for discrepancies.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        store_id = request.data.get("store")
        store = None
        if store_id:
            store = Store.objects.filter(organization=request.user.organization, id=store_id).first()

        result = FinancialReconciliationService.run_reconciliation(
            organization=request.user.organization,
            store=store,
            emit_alerts=True,
        )
        return Response(result)


class FinancialReconciliationExportView(APIView):
    """
    Exports financial reconciliation discrepancies to a downloadable CSV file.
    """
    permission_classes = [IsManagementOrAdmin]

    def get(self, request):
        result = FinancialReconciliationService.run_reconciliation(
            organization=request.user.organization,
            emit_alerts=False,
        )
        csv_data = FinancialReconciliationService.export_csv(result)
        response = HttpResponse(csv_data, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="financial_reconciliation.csv"'
        return response


class InventoryReconciliationView(APIView):
    """
    Returns latest inventory reconciliation status and discrepancies list.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        store_id = request.query_params.get("store")
        store = None
        if store_id:
            store = Store.objects.filter(organization=request.user.organization, id=store_id).first()

        result = InventoryReconciliationService.run_reconciliation(
            organization=request.user.organization,
            store=store,
            emit_alerts=False,
        )
        return Response(result)


class InventoryReconciliationRunView(APIView):
    """
    Triggers an on-demand inventory reconciliation and emits operational alerts.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        store_id = request.data.get("store")
        store = None
        if store_id:
            store = Store.objects.filter(organization=request.user.organization, id=store_id).first()

        result = InventoryReconciliationService.run_reconciliation(
            organization=request.user.organization,
            store=store,
            emit_alerts=True,
        )
        return Response(result)


class InventoryReconciliationExportView(APIView):
    """
    Exports inventory reconciliation discrepancies to a downloadable CSV file.
    """
    permission_classes = [IsManagementOrAdmin]

    def get(self, request):
        result = InventoryReconciliationService.run_reconciliation(
            organization=request.user.organization,
            emit_alerts=False,
        )
        csv_data = InventoryReconciliationService.export_csv(result)
        response = HttpResponse(csv_data, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="inventory_reconciliation.csv"'
        return response


class BackupStatusView(APIView):
    """
    Returns automated PostgreSQL backup history, size on disk, and last restoration verification drill.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        status_data = BackupService.get_backup_status(organization=request.user.organization)
        return Response(status_data)


class DailyClosingReportView(APIView):
    """
    Returns comprehensive end-of-day sales, collections, and cash drawer closing report.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        store_id = request.query_params.get("store")
        cashier_id = request.query_params.get("cashier")
        date_str = request.query_params.get("date")

        store = None
        if store_id:
            store = Store.objects.filter(organization=request.user.organization, id=store_id).first()

        cashier = None
        if cashier_id:
            cashier = request.user.organization.users.filter(id=cashier_id).first()

        target_date = None
        if date_str:
            from datetime import date
            try:
                target_date = date.fromisoformat(date_str)
            except ValueError:
                return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        report = DailyBusinessClosingService.get_daily_closing_report(
            organization=request.user.organization,
            store=store,
            cashier=cashier,
            target_date=target_date,
        )
        return Response(report)


class DailyClosingFinalizeView(APIView):
    """
    Manager / Admin approval and finalization of daily cash register closing.
    """
    permission_classes = [IsManagementOrAdmin]

    def post(self, request):
        actual_cash = request.data.get("actual_cash")
        if actual_cash is None:
            return Response({"error": "actual_cash is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            actual_cash_dec = Decimal(str(actual_cash))
        except Exception:
            return Response({"error": "Invalid actual_cash amount"}, status=status.HTTP_400_BAD_REQUEST)

        notes = str(request.data.get("notes") or "")
        store_id = request.data.get("store")
        store = None
        if store_id:
            store = Store.objects.filter(organization=request.user.organization, id=store_id).first()

        try:
            result = DailyBusinessClosingService.finalize_daily_closing(
                organization=request.user.organization,
                user=request.user,
                actual_counted_cash=actual_cash_dec,
                notes=notes,
                store=store,
            )
            return Response(result, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
