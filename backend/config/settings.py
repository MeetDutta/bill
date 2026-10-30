import os
import sys
from datetime import timedelta
from pathlib import Path

from decouple import config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

TESTING = "test" in sys.argv or "pytest" in sys.modules or any("pytest" in arg for arg in sys.argv)

# Production security hardening validator
KNOWN_INSECURE_SECRETS = {
    "django-insecure-change-me",
    "change-me-to-a-random-secret-key",
    "insecure-default-key",
    "secret",
    "django-insecure-test-key",
}

def validate_production_settings(
    *,
    debug: bool,
    secret_key: str,
    database_url: str | None,
    allowed_hosts: list[str],
    environment: str,
) -> None:
    """
    Validates that production/staging environments never start with unsafe settings.
    Raises ImproperlyConfigured if any unsafe configuration is detected.
    """
    is_prod_env = environment.lower() in ("production", "prod", "staging") or not debug

    if not is_prod_env:
        return

    if debug:
        raise ImproperlyConfigured(
            f"Production environment (ENVIRONMENT='{environment}') cannot run with DEBUG=True."
        )

    if (
        not secret_key
        or secret_key in KNOWN_INSECURE_SECRETS
        or secret_key.startswith("django-insecure-")
        or len(secret_key) < 32
    ):
        raise ImproperlyConfigured(
            "Insecure or default SECRET_KEY detected in production. "
            "A secure, random secret key of at least 32 characters is required."
        )

    if not database_url or "sqlite" in database_url.lower():
        raise ImproperlyConfigured(
            "Production environment requires a production database (e.g. PostgreSQL). "
            "DATABASE_URL must be configured."
        )

    clean_hosts = [h for h in allowed_hosts if h != "testserver"]
    if not clean_hosts or "*" in clean_hosts:
        raise ImproperlyConfigured(
            "ALLOWED_HOSTS must be explicitly defined with valid domain names in production and cannot be empty or '*'."
        )

# Support both canonical variable names (SECRET_KEY, DEBUG, ALLOWED_HOSTS)
# and DJANGO_-prefixed names (DJANGO_SECRET_KEY, DJANGO_DEBUG, DJANGO_ALLOWED_HOSTS)
SECRET_KEY = config(
    "SECRET_KEY",
    default=config("DJANGO_SECRET_KEY", default="django-insecure-change-me"),
)

DEBUG = config(
    "DEBUG",
    default=config("DJANGO_DEBUG", default=True, cast=bool),
    cast=bool,
)

ENVIRONMENT = config(
    "ENVIRONMENT",
    default=config("DJANGO_ENV", default="development"),
).lower()

# Detect WhiteNoise if installed
try:
    import whitenoise  # noqa: F401
    HAS_WHITENOISE = True
except ImportError:
    HAS_WHITENOISE = False

allowed_hosts_config = config(
    "ALLOWED_HOSTS",
    default=config(
        "DJANGO_ALLOWED_HOSTS",
        default="localhost,127.0.0.1,backend,web,testserver",
    ),
).split(",")
ALLOWED_HOSTS = []
for h in allowed_hosts_config:
    clean_h = h.strip().replace("https://", "").replace("http://", "").split("/")[0]
    if clean_h and clean_h not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(clean_h)

# Automatically register Render external hostname if set by platform
render_hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if render_hostname:
    clean_render = render_hostname.strip().replace("https://", "").replace("http://", "").split("/")[0]
    if clean_render not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(clean_render)

# Automatically register Render internal private service names
render_service_name = os.environ.get("RENDER_SERVICE_NAME")
if render_service_name:
    clean_svc = render_service_name.strip().replace("https://", "").replace("http://", "").split("/")[0]
    if clean_svc not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(clean_svc)

for default_internal in ["billmeet-backend", "backend", "web"]:
    if default_internal not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(default_internal)

if "testserver" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("testserver")

# Proxy SSL Header (Render terminates SSL at edge reverse proxy)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

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
    "apps.engagement",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    *(["whitenoise.middleware.WhiteNoiseMiddleware"] if HAS_WHITENOISE else []),
    "django.contrib.sessions.middleware.SessionMiddleware",
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

# Production security check: validated at import time unless executing tests
if not TESTING:
    validate_production_settings(
        debug=DEBUG,
        secret_key=SECRET_KEY,
        database_url=DATABASE_URL,
        allowed_hosts=ALLOWED_HOSTS,
        environment=ENVIRONMENT,
    )

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
    raise ImproperlyConfigured("DATABASE_URL environment variable must be set in production (DEBUG=False).")
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "OPTIONS": {
                "timeout": 30,
            },
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

if HAS_WHITENOISE and not DEBUG:
    STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

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

# Origin Normalizer for CORS & CSRF
def _normalize_origin(url_or_domain: str) -> list[str]:
    clean = url_or_domain.strip().rstrip("/")
    if not clean:
        return []
    if clean.startswith("http://") or clean.startswith("https://"):
        return [clean]
    return [f"https://{clean}", f"http://{clean}"]

# CORS
raw_cors_origins = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000",
).split(",")
CORS_ALLOWED_ORIGINS = []
for o in raw_cors_origins:
    CORS_ALLOWED_ORIGINS.extend(_normalize_origin(o))
CORS_ALLOWED_ORIGINS = list(dict.fromkeys(CORS_ALLOWED_ORIGINS))
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https:\/\/.*\.onrender\.com$",
    r"^http:\/\/localhost(:\d+)?$",
    r"^http:\/\/127\.0\.0\.1(:\d+)?$",
]

# Frontend URL
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:3000").strip()
for o in _normalize_origin(FRONTEND_URL):
    if o not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(o)

# CSRF Trusted Origins (required for Render reverse proxy and custom domains)
raw_csrf_origins = config("CSRF_TRUSTED_ORIGINS", default="").split(",")
CSRF_TRUSTED_ORIGINS = []
for o in raw_csrf_origins:
    CSRF_TRUSTED_ORIGINS.extend(_normalize_origin(o))
for o in CORS_ALLOWED_ORIGINS:
    if o not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(o)
if render_hostname:
    for o in _normalize_origin(render_hostname):
        if o not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(o)
if "https://*.onrender.com" not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append("https://*.onrender.com")

# Production Security & Cookie Hardening
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=False, cast=bool)
SESSION_COOKIE_SECURE = config("SESSION_COOKIE_SECURE", default=False, cast=bool)
CSRF_COOKIE_SECURE = config("CSRF_COOKIE_SECURE", default=False, cast=bool)
SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=0, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False, cast=bool)
SECURE_HSTS_PRELOAD = config("SECURE_HSTS_PRELOAD", default=False, cast=bool)

# Controlled Pilot Configuration
PILOT_MODE = config("PILOT_MODE", default=True, cast=bool)
PILOT_VERSION = config("PILOT_VERSION", default="1.0-pilot")
PILOT_NAME = config("PILOT_NAME", default="Controlled Pilot Deployment")

# Redis & Celery
REDIS_HOST = "redis" if os.environ.get("DOCKER_CONTAINER") or os.path.exists("/.dockerenv") else "127.0.0.1"
REDIS_URL = config("REDIS_URL", default=f"redis://{REDIS_HOST}:6379/0")
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default=REDIS_URL)
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_DEFAULT_QUEUE = "celery"

BUSINESS_TIMEZONE = config("BUSINESS_TIMEZONE", default="Asia/Kolkata")

CELERY_TASK_ALWAYS_EAGER = config("CELERY_TASK_ALWAYS_EAGER", default=True, cast=bool)
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = False
CELERY_BROKER_CONNECTION_MAX_RETRIES = 1

# AWS S3
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="")
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="")
AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default="")

# WhatsApp (supports both canonical WHATSAPP_ACCESS_TOKEN and legacy WHATSAPP_API_TOKEN)
WHATSAPP_ACCESS_TOKEN = config("WHATSAPP_ACCESS_TOKEN", default=config("WHATSAPP_API_TOKEN", default=""))
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
