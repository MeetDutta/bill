from django.urls import path
from apps.migration.views import (
    POSMigrationUploadView,
    POSMigrationJobListView,
    POSMigrationJobDetailView,
    POSMigrationValidateView,
    POSMigrationExecuteView,
    POSMigrationRollbackView,
)

app_name = "migration"

urlpatterns = [
    path("upload/", POSMigrationUploadView.as_view(), name="migration-upload"),
    path("jobs/", POSMigrationJobListView.as_view(), name="migration-job-list"),
    path("jobs/<uuid:pk>/", POSMigrationJobDetailView.as_view(), name="migration-job-detail"),
    path("jobs/<uuid:pk>/validate/", POSMigrationValidateView.as_view(), name="migration-job-validate"),
    path("jobs/<uuid:pk>/execute/", POSMigrationExecuteView.as_view(), name="migration-job-execute"),
    path("jobs/<uuid:pk>/rollback/", POSMigrationRollbackView.as_view(), name="migration-job-rollback"),
]
