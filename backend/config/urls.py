from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse, JsonResponse
from django.urls import include, path

from apps.analytics.views import (
    AICopilotQueryView,
    BusinessAlertAcknowledgeView,
    BusinessAlertDismissView,
    BusinessAlertsListView,
    CustomerPortalPublicView,
)
from apps.reports.views import SystemHealthView


def root_index_view(request):
    """
    Root status page for the backend service.
    Serves a styled HTML status page for web browsers, and JSON for API clients.
    """
    frontend_url = getattr(settings, "FRONTEND_URL", "https://billmeet-frontend.onrender.com")
    env_name = getattr(settings, "ENVIRONMENT", "production").title()
    version = getattr(settings, "PILOT_VERSION", "1.0-pilot")

    if "text/html" in request.headers.get("Accept", ""):
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BillMeet API &bull; Service Online</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
        }}
        .card {{
            background: rgba(30, 41, 59, 0.85);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 40px;
            max-width: 520px;
            width: 100%;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }}
        .status-pill {{
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(16, 185, 129, 0.12);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.25);
            border-radius: 9999px;
            padding: 6px 14px;
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 24px;
        }}
        .pulse {{
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            box-shadow: 0 0 10px #10b981;
            animation: pulse 2s infinite;
        }}
        @keyframes pulse {{
            0% {{ transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }}
            70% {{ transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }}
            100% {{ transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }}
        }}
        h1 {{
            font-size: 26px;
            font-weight: 700;
            margin-bottom: 10px;
            color: #ffffff;
            letter-spacing: -0.02em;
        }}
        p {{
            color: #94a3b8;
            font-size: 15px;
            line-height: 1.6;
            margin-bottom: 28px;
        }}
        .links {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}
        .btn {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            border-radius: 12px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
        }}
        .btn-primary {{
            background: #2563eb;
            color: #ffffff;
        }}
        .btn-primary:hover {{
            background: #1d4ed8;
            transform: translateY(-1px);
        }}
        .btn-secondary {{
            background: #334155;
            color: #f1f5f9;
        }}
        .btn-secondary:hover {{
            background: #475569;
            transform: translateY(-1px);
        }}
        .btn-outline {{
            background: transparent;
            color: #94a3b8;
            border: 1px solid #475569;
        }}
        .btn-outline:hover {{
            background: rgba(255, 255, 255, 0.05);
            color: #ffffff;
            border-color: #64748b;
        }}
        .footer {{
            margin-top: 28px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #64748b;
        }}
    </style>
</head>
<body>
    <div class="card">
        <div class="status-pill">
            <span class="pulse"></span> Operational
        </div>
        <h1>BillMeet Backend API</h1>
        <p>The Django REST service is running live on Render. All endpoints, authentication, and database connections are active.</p>
        <div class="links">
            <a href="{frontend_url}" class="btn btn-primary" target="_blank">
                <span>🚀 Open Frontend Application</span>
                <span>&rarr;</span>
            </a>
            <a href="/admin/" class="btn btn-secondary">
                <span>🔑 Django Admin Portal</span>
                <span>&rarr;</span>
            </a>
            <a href="/health/" class="btn btn-outline">
                <span>🩺 System Health Status</span>
                <span>&rarr;</span>
            </a>
        </div>
        <div class="footer">
            <span>Env: {env_name}</span>
            <span>Version {version}</span>
        </div>
    </div>
</body>
</html>"""
        return HttpResponse(html, content_type="text/html")

    return JsonResponse({
        "service": "BillMeet SaaS API",
        "status": "online",
        "environment": env_name.lower(),
        "version": version,
        "endpoints": {
            "admin": "/admin/",
            "health": "/health/",
            "health_liveness": "/health/liveness/",
            "api_auth": "/api/v1/auth/",
            "api_invoices": "/api/v1/invoices/",
            "frontend": frontend_url,
        },
    })


urlpatterns = [
    path("", root_index_view, name="root-index"),
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
    path("api/v1/health/system/", SystemHealthView.as_view(), name="root-system-health"),
    path("api/v1/health/", include("apps.notifications.health_urls")),
    path("health/", include("apps.notifications.health_urls")),
]


if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
