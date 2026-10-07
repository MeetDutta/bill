from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.analytics.views import (
    AICopilotQueryView,
    BusinessAlertAcknowledgeView,
    BusinessAlertDismissView,
    BusinessAlertsListView,
    CustomerPortalPublicView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.authentication.urls")),
    path("api/v1/organizations/", include("apps.organizations.urls")),
    path("api/v1/users/", include("apps.users.urls")),
    path("api/v1/stores/", include("apps.stores.urls")),
    path("api/v1/customers/", include("apps.customers.urls")),
    path("api/v1/products/", include("apps.products.urls")),
    path("api/v1/suppliers/", include("apps.products.supplier_urls")),
    path("api/v1/transactions/", include("apps.transactions.urls")),
    path("api/v1/invoices/", include("apps.invoices.urls")),
    path("api/v1/quotations/", include("apps.invoices.quotation_urls")),
    path("api/v1/loyalty/", include("apps.loyalty.urls")),
    path("api/v1/coupons/", include("apps.coupons.urls")),
    path("api/v1/campaigns/", include("apps.campaigns.urls")),
    path("api/v1/automations/", include("apps.automations.urls")),
    path("api/v1/whatsapp/", include("apps.whatsapp.urls")),
    path("api/v1/integrations/", include("apps.integrations.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/analytics/", include("apps.analytics.urls")),
    path("api/v1/subscriptions/", include("apps.subscriptions.urls")),
    path("api/v1/reports/", include("apps.reports.urls")),
    path("api/v1/ai/", include("apps.ai.urls")),
    path("api/v1/engagement/", include("apps.engagement.urls")),
    path("api/v1/customer-portal/<str:token>/", CustomerPortalPublicView.as_view(), name="customer-portal-public"),
    path("api/v1/copilot/query/", AICopilotQueryView.as_view(), name="root-copilot-query"),
    path("api/v1/alerts/", BusinessAlertsListView.as_view(), name="root-alerts-list"),
    path("api/v1/alerts/<uuid:pk>/acknowledge/", BusinessAlertAcknowledgeView.as_view(), name="root-alert-ack"),
    path("api/v1/alerts/<uuid:pk>/dismiss/", BusinessAlertDismissView.as_view(), name="root-alert-dism"),
    path("api/v1/pos/", include("apps.billing.urls")),
    path("health/", include("apps.notifications.health_urls")),
]


if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
