from django.urls import path
from . import views

urlpatterns=[
    path("dashboard/",views.EngagementDashboardView.as_view()),
    path("customers/<uuid:pk>/",views.Customer360View.as_view()),
    path("customers/<uuid:pk>/score/",views.CustomerScoreView.as_view()),
    path("segments/",views.SegmentsView.as_view()),
    path("reviews/",views.ReviewListCreateView.as_view()),
    path("referrals/",views.ReferralListCreateView.as_view()),
    path("campaign-assistant/",views.CampaignAssistantView.as_view()),
]
