from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from common.permissions import IsAdminOrManager
from apps.migration.models import POSMigrationJob
from apps.migration.serializers import (
    POSMigrationJobSerializer,
    POSMigrationUploadSerializer,
    POSMigrationValidateSerializer,
)
from apps.migration.services.pos_migration_service import POSMigrationService


class POSMigrationUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = POSMigrationUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["file"]
        entity_type = serializer.validated_data.get("entity_type", "products")
        duplicate_strategy = serializer.validated_data.get("duplicate_strategy", "skip")

        try:
            content_bytes = uploaded_file.read()
            try:
                content_str = content_bytes.decode("utf-8-sig")
            except UnicodeDecodeError:
                content_str = content_bytes.decode("latin-1")
        except Exception as e:
            return Response({"error": f"Failed to read CSV file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        headers, rows = POSMigrationService.parse_csv_content(content_str)
        if not headers:
            return Response({"error": "CSV file does not contain valid headers."}, status=status.HTTP_400_BAD_REQUEST)

        suggested_mapping = POSMigrationService.suggest_column_mapping(headers, entity_type)

        job = POSMigrationJob.objects.create(
            organization=request.user.organization,
            user=request.user,
            file_name=uploaded_file.name,
            entity_type=entity_type,
            duplicate_strategy=duplicate_strategy,
            raw_headers=headers,
            sample_rows=rows[:10],
            file_content=content_str,
            column_mapping=suggested_mapping,
            total_rows=len(rows),
            status="uploaded",
        )

        # Run initial validation with suggested mapping
        POSMigrationService.validate_job(job, column_mapping=suggested_mapping, duplicate_strategy=duplicate_strategy)

        return Response(POSMigrationJobSerializer(job).data, status=status.HTTP_201_CREATED)


class POSMigrationJobListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        jobs = POSMigrationJob.objects.filter(organization=request.user.organization).order_by("-created_at")[:50]
        return Response(POSMigrationJobSerializer(jobs, many=True).data)


class POSMigrationJobDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def get(self, request, pk):
        try:
            job = POSMigrationJob.objects.get(id=pk, organization=request.user.organization)
        except POSMigrationJob.DoesNotExist:
            return Response({"error": "Migration job not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(POSMigrationJobSerializer(job).data)

    def delete(self, request, pk):
        try:
            job = POSMigrationJob.objects.get(id=pk, organization=request.user.organization)
        except POSMigrationJob.DoesNotExist:
            return Response({"error": "Migration job not found."}, status=status.HTTP_404_NOT_FOUND)
        job.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class POSMigrationValidateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]
    parser_classes = [JSONParser]

    def post(self, request, pk):
        try:
            job = POSMigrationJob.objects.get(id=pk, organization=request.user.organization)
        except POSMigrationJob.DoesNotExist:
            return Response({"error": "Migration job not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = POSMigrationValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mapping = serializer.validated_data["column_mapping"]
        strategy = serializer.validated_data.get("duplicate_strategy", job.duplicate_strategy)

        validated_job = POSMigrationService.validate_job(job, column_mapping=mapping, duplicate_strategy=strategy)
        return Response(POSMigrationJobSerializer(validated_job).data)


class POSMigrationExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def post(self, request, pk):
        try:
            job = POSMigrationJob.objects.get(id=pk, organization=request.user.organization)
        except POSMigrationJob.DoesNotExist:
            return Response({"error": "Migration job not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            completed_job = POSMigrationService.execute_import(job)
            return Response(POSMigrationJobSerializer(completed_job).data)
        except Exception as e:
            return Response({"error": str(e), "job": POSMigrationJobSerializer(job).data}, status=status.HTTP_400_BAD_REQUEST)


class POSMigrationRollbackView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrManager]

    def post(self, request, pk):
        try:
            job = POSMigrationJob.objects.get(id=pk, organization=request.user.organization)
        except POSMigrationJob.DoesNotExist:
            return Response({"error": "Migration job not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            rolled_back_job = POSMigrationService.rollback_job(job)
            return Response(POSMigrationJobSerializer(rolled_back_job).data)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
