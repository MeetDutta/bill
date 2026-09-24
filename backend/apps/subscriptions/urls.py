from django.urls import path

from . import views

urlpatterns = [
    path("plans/", views.PlanListView.as_view(), name="plan-list"),
    path("plans/<uuid:pk>/", views.PlanDetailView.as_view(), name="plan-detail"),
    path("", views.SubscriptionListView.as_view(), name="subscription-list"),
    path("<uuid:pk>/", views.SubscriptionDetailView.as_view(), name="subscription-detail"),
    path("create/", views.CreateSubscriptionView.as_view(), name="subscription-create"),
    path("<uuid:pk>/cancel/", views.CancelSubscriptionView.as_view(), name="subscription-cancel"),
    path("usage/", views.UsageListView.as_view(), name="usage-list"),
    path("usage/summary/", views.UsageSummaryView.as_view(), name="usage-summary"),
    path("check/", views.CheckEntitlementView.as_view(), name="check-entitlement"),
]
