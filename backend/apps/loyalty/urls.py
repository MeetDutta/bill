from django.urls import path

from . import views

urlpatterns = [
    path("accounts/", views.LoyaltyAccountListView.as_view(), name="loyalty-account-list"),
    path("accounts/<uuid:pk>/", views.LoyaltyAccountDetailView.as_view(), name="loyalty-account-detail"),
    path("rules/", views.LoyaltyRuleListView.as_view(), name="loyalty-rule-list"),
    path("rules/<uuid:pk>/", views.LoyaltyRuleDetailView.as_view(), name="loyalty-rule-detail"),
    path("transactions/", views.LoyaltyTransactionListView.as_view(), name="loyalty-transaction-list"),
    path("redeem/", views.RedeemPointsView.as_view(), name="loyalty-redeem"),
]
