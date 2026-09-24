from django.urls import path

from . import views

urlpatterns = [
    path("", views.DashboardView.as_view(), name="analytics-dashboard"),
    path("sales/", views.DailySalesReportListView.as_view(), name="analytics-sales"),
    path("customers/", views.CustomerAnalyticsListView.as_view(), name="analytics-customers"),
    path("campaigns/", views.CampaignAnalyticsListView.as_view(), name="analytics-campaigns"),
]
