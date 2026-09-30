import logging
from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.urls import path
import redis

logger = logging.getLogger(__name__)


def health_check(request):
    checks = {
        "status": "healthy",
        "database": "unknown",
        "redis": "unknown",
    }
    healthy = True

    # 1. Database connectivity check
    try:
        connection.ensure_connection()
        checks["database"] = "ok"
    except Exception as e:
        logger.error(f"Health check database failure: {e}")
        checks["database"] = "down"
        healthy = False

    # 2. Redis connectivity check
    try:
        redis_url = getattr(settings, "REDIS_URL", "redis://redis:6379/0")
        r = redis.from_url(redis_url, socket_connect_timeout=2)
        if r.ping():
            checks["redis"] = "ok"
        else:
            checks["redis"] = "unresponsive"
            if not getattr(settings, "DEBUG", True):
                healthy = False
    except Exception as e:
        logger.warning(f"Health check redis failure: {e}")
        checks["redis"] = "down"
        if not getattr(settings, "DEBUG", True):
            healthy = False

    checks["status"] = "healthy" if healthy else "unhealthy"
    status_code = 200 if healthy else 503
    return JsonResponse(checks, status=status_code)


urlpatterns = [
    path("", health_check, name="health-check"),
]
