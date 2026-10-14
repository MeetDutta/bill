import logging
from django.http import JsonResponse
from django.urls import path
from apps.reports.services.health_service import SystemHealthService

logger = logging.getLogger(__name__)


def health_check(request):
    """
    Standard readiness probe (backwards-compatible).
    Checks database connection and Redis ping.
    """
    checks = SystemHealthService.get_readiness()
    status_code = 200 if checks.get("status") == "healthy" else 503
    return JsonResponse(checks, status=status_code)


def liveness_check(request):
    """
    Lightweight liveness probe: Determines whether the process is alive.
    Does not perform heavy database or network queries.
    """
    data = SystemHealthService.get_liveness()
    return JsonResponse(data, status=200)


def readiness_check(request):
    """
    Readiness probe: Determines whether the backend can safely accept traffic.
    Validates bounded database connection and cache responsiveness.
    """
    checks = SystemHealthService.get_readiness()
    status_code = 200 if checks.get("status") == "healthy" else 503
    return JsonResponse(checks, status=status_code)


urlpatterns = [
    path("", health_check, name="health-check"),
    path("liveness/", liveness_check, name="health-liveness"),
    path("readiness/", readiness_check, name="health-readiness"),
]
