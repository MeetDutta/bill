from django.urls import path

from . import views

urlpatterns = [
    path("generate-content/", views.GenerateCampaignContentView.as_view(), name="ai-generate-content"),
    path("insights/", views.CustomerInsightsView.as_view(), name="ai-insights-list"),
    path("insights/<uuid:pk>/", views.CustomerInsightDetailView.as_view(), name="ai-insight-detail"),
    path("insights/generate/<uuid:pk>/", views.GenerateCustomerInsightsView.as_view(), name="ai-generate-insights"),
    path("segments/", views.AISegmentationListView.as_view(), name="ai-segment-list"),
    path("segments/<uuid:pk>/", views.AISegmentationDetailView.as_view(), name="ai-segment-detail"),
    path("segments/generate/", views.GenerateSegmentationView.as_view(), name="ai-generate-segment"),
]
