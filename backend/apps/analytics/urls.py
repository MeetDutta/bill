from django.urls import path

from . import views

urlpatterns = [
    path("", views.DashboardView.as_view(), name="analytics-dashboard"),
    path("dashboard/", views.DashboardView.as_view(), name="analytics-dashboard-alias"),
    path("revenue-trend/", views.RevenueTrendView.as_view(), name="analytics-revenue-trend"),
    path("customer-growth/", views.CustomerGrowthView.as_view(), name="analytics-customer-growth"),
    path("sales/", views.DailySalesReportListView.as_view(), name="analytics-sales"),
    path("customers/", views.CustomerAnalyticsListView.as_view(), name="analytics-customers"),
    path("campaigns/", views.CampaignAnalyticsListView.as_view(), name="analytics-campaigns"),

    # RFM Intelligence
    path("rfm/", views.RFMDistributionView.as_view(), name="analytics-rfm"),
    path("rfm/distribution/", views.RFMDistributionView.as_view(), name="analytics-rfm-distribution"),
    path("rfm/summary/", views.RFMSummaryView.as_view(), name="analytics-rfm-summary"),
    path("rfm/customers/", views.RFMCustomersView.as_view(), name="analytics-rfm-customers"),
    path("rfm/customers/<uuid:pk>/", views.CustomerRFMDetailView.as_view(), name="analytics-rfm-customer-detail"),

    # Customer Health & Churn & Next Best Action
    path("customers/<uuid:pk>/health/", views.CustomerHealthDetailView.as_view(), name="analytics-customer-health"),
    path("customers/<uuid:pk>/churn/", views.CustomerChurnDetailView.as_view(), name="analytics-customer-churn"),
    path("customers/<uuid:pk>/next-action/", views.CustomerNextActionView.as_view(), name="analytics-customer-next-action"),
    path("customers/<uuid:pk>/recommendations/", views.CustomerOfferRecommendationView.as_view(), name="analytics-customer-recommendations"),
    path("customers/<uuid:pk>/create-recommended-offer/", views.CreateRecommendedOfferView.as_view(), name="analytics-customer-create-offer"),
    path("churn/at-risk/", views.AtRiskCustomersListView.as_view(), name="analytics-churn-at-risk"),

    # Business Health, Retention & Cohorts
    path("business-health/", views.BusinessHealthView.as_view(), name="analytics-business-health"),
    path("customer-retention/", views.CustomerRetentionMetricsView.as_view(), name="analytics-customer-retention"),
    path("cohorts/", views.CohortRetentionView.as_view(), name="analytics-cohorts"),

    # Product Intelligence & Bundles
    path("products/", views.ProductIntelligenceListView.as_view(), name="analytics-products-intelligence"),
    path("products/affinity/", views.ProductAffinityListView.as_view(), name="analytics-products-affinity"),
    path("products/bundles/", views.ProductBundleListView.as_view(), name="analytics-products-bundles"),

    # Alerts & Anomaly Detection
    path("alerts/", views.BusinessAlertsListView.as_view(), name="analytics-alerts"),
    path("alerts/<uuid:pk>/acknowledge/", views.BusinessAlertAcknowledgeView.as_view(), name="analytics-alert-acknowledge"),
    path("alerts/<uuid:pk>/dismiss/", views.BusinessAlertDismissView.as_view(), name="analytics-alert-dismiss"),

    # Multi-store & Staff
    path("stores/comparison/", views.StoreComparisonView.as_view(), name="analytics-stores-comparison"),
    path("staff/", views.StaffPerformanceView.as_view(), name="analytics-staff-performance"),
]

