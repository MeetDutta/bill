from django.urls import path

from . import views

urlpatterns = [
    path("", views.CouponListView.as_view(), name="coupon-list"),
    path("<uuid:pk>/", views.CouponDetailView.as_view(), name="coupon-detail"),
    path("validate/", views.ValidateCouponView.as_view(), name="coupon-validate"),
    path("redeem/", views.RedeemCouponView.as_view(), name="coupon-redeem"),
]
