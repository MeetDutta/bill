from django.urls import path

from . import views

urlpatterns = [
    path("generate/", views.ReportGenerateView.as_view(), name="report-generate"),
]
