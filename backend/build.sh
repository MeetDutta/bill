#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "===> [Backend Build] Upgrading pip and installing dependencies..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo "===> [Backend Build] Collecting static files with WhiteNoise..."
python manage.py collectstatic --no-input

echo "===> [Backend Build] Backend build complete."
