from django.urls import path
from .views import (
    BusinessConfigView,
    BusinessTypesListView,
    POSProductSearchView,
    POSProductQuickCreateView,
    POSCalculateView,
    POSCheckoutView,
    POSHeldCartView,
    POSHeldCartDetailView,
    POSReturnProcessView,
    POSCreditPaymentView,
    POSCustomerLedgerView,
    POSRegisterStatusView,
    POSRegisterOpenView,
    POSRegisterMovementView,
    POSRegisterCloseView,
    POSInventoryMovementListView,
    POSInventoryAdjustView,
    POSPurchaseOrderView,
    POSSalesReportView,
    POSPaymentReportView,
    POSProductSalesReportView,
    POSTaxReportView,
    POSReturnsReportView,
    POSOutstandingReportView,
    POSDailyClosingReportView,
)

app_name = "billing"

urlpatterns = [
    # Configuration & Business Types
    path("config/", BusinessConfigView.as_view(), name="pos-config"),
    path("business-types/", BusinessTypesListView.as_view(), name="pos-business-types"),

    # Products & Search
    path("products/", POSProductSearchView.as_view(), name="pos-products"),
    path("products/quick-create/", POSProductQuickCreateView.as_view(), name="pos-products-quick-create"),

    # Cart & Checkout
    path("calculate/", POSCalculateView.as_view(), name="pos-calculate"),
    path("cart/calculate/", POSCalculateView.as_view(), name="pos-cart-calculate"),
    path("checkout/", POSCheckoutView.as_view(), name="pos-checkout"),

    # Held Carts / Drafts
    path("held/", POSHeldCartView.as_view(), name="pos-held-list"),
    path("held/<uuid:pk>/", POSHeldCartDetailView.as_view(), name="pos-held-detail"),
    path("held-carts/", POSHeldCartView.as_view(), name="pos-held-carts-list"),
    path("held-carts/<uuid:pk>/", POSHeldCartDetailView.as_view(), name="pos-held-carts-detail"),

    # Returns & Refunds
    path("returns/", POSReturnProcessView.as_view(), name="pos-returns"),

    # Udhaar / Customer Credit
    path("credit/record-payment/", POSCreditPaymentView.as_view(), name="pos-credit-payment"),
    path("credit/payment/", POSCreditPaymentView.as_view(), name="pos-credit-payment-alias"),
    path("credit/<uuid:customer_id>/ledger/", POSCustomerLedgerView.as_view(), name="pos-customer-ledger"),
    path("credit/customers/<uuid:customer_id>/", POSCustomerLedgerView.as_view(), name="pos-customer-ledger-alias"),

    # Cash Register / Day Close
    path("register/status/", POSRegisterStatusView.as_view(), name="pos-register-status"),
    path("register/current/", POSRegisterStatusView.as_view(), name="pos-register-current"),
    path("register/open/", POSRegisterOpenView.as_view(), name="pos-register-open"),
    path("register/movement/", POSRegisterMovementView.as_view(), name="pos-register-movement"),
    path("register/close/", POSRegisterCloseView.as_view(), name="pos-register-close"),

    # Inventory
    path("inventory/movements/", POSInventoryMovementListView.as_view(), name="pos-inventory-movements"),
    path("inventory/adjust/", POSInventoryAdjustView.as_view(), name="pos-inventory-adjust"),
    path("inventory/purchases/", POSPurchaseOrderView.as_view(), name="pos-inventory-purchases"),

    # Reports
    path("reports/sales/", POSSalesReportView.as_view(), name="pos-report-sales"),
    path("reports/payments/", POSPaymentReportView.as_view(), name="pos-report-payments"),
    path("reports/product-sales/", POSProductSalesReportView.as_view(), name="pos-report-product-sales"),
    path("reports/tax/", POSTaxReportView.as_view(), name="pos-report-tax"),
    path("reports/returns/", POSReturnsReportView.as_view(), name="pos-report-returns"),
    path("reports/outstanding/", POSOutstandingReportView.as_view(), name="pos-report-outstanding"),
    path("reports/daily-closing/", POSDailyClosingReportView.as_view(), name="pos-report-daily-closing"),
]
