# Deployment & Production Operations Guide

## 1. Prerequisites
- **Python**: 3.11+
- **Node.js**: 18+ or 20+
- **PostgreSQL**: 15+ (or SQLite for development)
- **Redis**: 7+ (for caching and Celery task queues)

---

## 2. Environment Variables

Create `.env` at the root (or inside `backend/` and `frontend/`) based on `.env.example`:

### Backend (`.env` or `backend/.env`)
```bash
ENVIRONMENT=production
DEBUG=False
SECRET_KEY=your-production-secret-key-at-least-50-chars
ALLOWED_HOSTS=api.yourdomain.com,yourdomain.com
DATABASE_URL=postgres://digitalbill_user:digitalbill_password@db:5432/digitalbill_db
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# WhatsApp Cloud API (WHATSAPP_ACCESS_TOKEN or legacy WHATSAPP_API_TOKEN)
WHATSAPP_ACCESS_TOKEN=your-whatsapp-cloud-api-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-account-id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-webhook-verify-token
```

> **Security Guard**: When `ENVIRONMENT=production` or `DEBUG=False`, Django will fail startup with `ImproperlyConfigured` if `DEBUG=True`, if a known development secret is used, or if `DATABASE_URL` is missing.

### Frontend (`frontend/.env.local` or Docker Compose environment)
```bash
# In production behind Nginx reverse proxy, leave as /api/v1 (same-origin).
# For separate domain API deployment, set to full URL (e.g. https://api.yourdomain.com/api/v1).
NEXT_PUBLIC_API_URL=/api/v1
```

---

## 3. Database Migrations

Apply database migrations in order:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
```

---

## 4. Running with Docker Compose

To run the complete production-ready stack (Django, Next.js, Postgres, Redis, Celery):
```bash
docker compose up -d --build
```

---

## 5. Background Task Processing

Start the Celery worker for asynchronous analytics calculations and automated journeys:
```bash
cd backend
celery -A config worker --loglevel=info -c 4
```

Start the Celery beat scheduler for periodic RFM refreshes and churn scans:
```bash
celery -A config beat --loglevel=info
```

---

## 6. Running Tests

Run the backend test suite:
```bash
cd backend
pytest tests/ -v
```

Run frontend type-checking and production build verification:
```bash
cd frontend
npx tsc --noEmit
npm run build
```
