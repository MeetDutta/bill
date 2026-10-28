#!/usr/bin/env bash
# Exit on error
set -o errexit

PORT="${PORT:-10000}"
WEB_CONCURRENCY="${WEB_CONCURRENCY:-1}"

echo "===> [Backend Start] Running database migrations..."
python manage.py migrate --no-input

echo "===> [Backend Start] Ensuring superuser exists if env credentials provided..."
python manage.py createsuperuser_if_none_exists || true

echo "===> [Backend Start] Launching Gunicorn WSGI on 0.0.0.0:${PORT}..."
exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT}" \
    --workers "${WEB_CONCURRENCY}" \
    --threads 4 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
