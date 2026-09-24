from django.urls import path

from . import views

urlpatterns = [
    path("", views.CampaignListView.as_view(), name="campaign-list"),
    path("<uuid:pk>/", views.CampaignDetailView.as_view(), name="campaign-detail"),
    path("<uuid:pk>/send/", views.SendCampaignView.as_view(), name="campaign-send"),
    path("<uuid:pk>/preview/", views.CampaignPreviewView.as_view(), name="campaign-preview"),
    path("<uuid:campaign_pk>/messages/", views.CampaignMessageListView.as_view(), name="campaign-messages"),
]
