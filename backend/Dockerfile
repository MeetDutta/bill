FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=10000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libffi-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-collect static files during build
RUN DJANGO_SECRET_KEY="build-phase-placeholder-secret-key-32chars" \
    ENVIRONMENT="development" \
    DEBUG="True" \
    python manage.py collectstatic --no-input

RUN chmod +x /app/start.sh /app/build.sh 2>/dev/null || true

EXPOSE 10000

CMD ["/app/start.sh"]
