import os
from datetime import timedelta
from pathlib import Path

from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("DJANGO_SECRET_KEY", default="django-insecure-change-me")

DEBUG = config("DJANGO_DEBUG", default=True, cast=bool)

allowed_hosts_config = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1,backend,web,testserver").split(",")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_config if h.strip()]
if "testserver" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("testserver")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "django_celery_beat",
    "django_celery_results",
    # Local apps
    "apps.authentication",
    "apps.organizations",
    "apps.users",
    "apps.stores",
    "apps.customers",
    "apps.products",
    "apps.transactions",
    "apps.invoices",
    "apps.loyalty",
    "apps.coupons",
    "apps.campaigns",
    "apps.automations",
    "apps.whatsapp",
    "apps.integrations",
    "apps.notifications",
    "apps.analytics",
    "apps.subscriptions",
    "apps.billing",
    "apps.reports",
    "apps.ai",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASE_URL = config("DATABASE_URL", default=None)

if DATABASE_URL:
    try:
        import dj_database_url
        DATABASES = {
            "default": dj_database_url.parse(
                DATABASE_URL,
                conn_max_age=600,
                conn_health_checks=True,
            )
        }
    except ImportError:
        from urllib.parse import urlparse, unquote
        url = urlparse(DATABASE_URL)
        engine = (
            "django.db.backends.postgresql"
            if "postgres" in url.scheme
            else "django.db.backends.sqlite3"
        )
        DATABASES = {
            "default": {
                "ENGINE": engine,
                "NAME": unquote(url.path.lstrip("/")),
                "USER": unquote(url.username or ""),
                "PASSWORD": unquote(url.password or ""),
                "HOST": url.hostname or "",
                "PORT": url.port or 5432,
                "CONN_MAX_AGE": 600,
            }
        }
elif not DEBUG:
    raise ValueError("DATABASE_URL environment variable must be set in production (DEBUG=False).")
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
    },
}

# JWT Settings
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# CORS
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000",
).split(",")
CORS_ALLOW_CREDENTIALS = True

# Frontend URL
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:3000")

# Redis & Celery
REDIS_URL = config("REDIS_URL", default="redis://redis:6379/0")
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default=config("REDIS_URL", default="redis://redis:6379/1"))
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://redis:6379/2")
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_DEFAULT_QUEUE = "celery"

BUSINESS_TIMEZONE = config("BUSINESS_TIMEZONE", default="Asia/Kolkata")

import sys
TESTING = "test" in sys.argv or "pytest" in sys.modules or any("pytest" in arg for arg in sys.argv)
CELERY_TASK_ALWAYS_EAGER = config("CELERY_TASK_ALWAYS_EAGER", default=TESTING, cast=bool)
CELERY_TASK_EAGER_PROPAGATES = True

# AWS S3
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="")
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="")
AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default="")

# WhatsApp
WHATSAPP_ACCESS_TOKEN = config("WHATSAPP_ACCESS_TOKEN", default="")
WHATSAPP_PHONE_NUMBER_ID = config("WHATSAPP_PHONE_NUMBER_ID", default="")
WHATSAPP_BUSINESS_ACCOUNT_ID = config("WHATSAPP_BUSINESS_ACCOUNT_ID", default="")
WHATSAPP_WEBHOOK_VERIFY_TOKEN = config("WHATSAPP_WEBHOOK_VERIFY_TOKEN", default="")
WHATSAPP_API_VERSION = config("WHATSAPP_API_VERSION", default="v20.0")
WHATSAPP_API_BASE_URL = config("WHATSAPP_API_BASE_URL", default=f"https://graph.facebook.com/{WHATSAPP_API_VERSION}")

# Sentry
SENTRY_DSN = config("SENTRY_DSN", default="")

if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=True,
    )

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
