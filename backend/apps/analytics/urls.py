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
]
