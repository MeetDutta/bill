from django.urls import path

from . import views

urlpatterns = [
    path("", views.AutomationListView.as_view(), name="automation-list"),
    path("<uuid:pk>/", views.AutomationDetailView.as_view(), name="automation-detail"),
    path("executions/", views.AutomationExecutionListView.as_view(), name="automation-execution-list"),
]
