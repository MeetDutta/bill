# Deployment & Production Operations Guide

## 1. Prerequisites
- **Python**: 3.11+
- **Node.js**: 18+ or 20+
- **PostgreSQL**: 15+ (or SQLite for development)
- **Redis**: 7+ (for caching and Celery task queues)

---

## 2. Environment Variables

Create `.env` inside `backend/` and `frontend/` based on `.env.example`:

### Backend (`backend/.env`)
```bash
DEBUG=False
SECRET_KEY=your-production-secret-key-at-least-50-chars
ALLOWED_HOSTS=api.yourdomain.com,localhost
DATABASE_URL=postgres://user:password@localhost:5432/billfree_prod
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com,http://localhost:3000
WHATSAPP_API_TOKEN=your-whatsapp-cloud-api-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
```

### Frontend (`frontend/.env.local`)
```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
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
