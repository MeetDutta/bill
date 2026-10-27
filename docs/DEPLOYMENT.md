# BillMeet Deployment & Production Operations Guide

This guide details the deployment procedures for the **BillMeet** SaaS platform (Django REST Framework Backend + Next.js Frontend + PostgreSQL Database + Celery/Redis).

---

## 1. Architecture Overview

| Component | Technology | Recommended Cloud / Service | Local Development |
| :--- | :--- | :--- | :--- |
| **Database** | PostgreSQL 16 | Render PostgreSQL / AWS RDS | SQLite or PostgreSQL 16 |
| **Backend API** | Django 5.1 + Gunicorn + WhiteNoise | Web Service (Docker) | `python manage.py runserver` |
| **Frontend UI** | Next.js 14 (App Router) | Web Service (Node.js 20) | `npm run dev` |
| **Task Queue** | Celery (Redis Broker) | Background Worker (or eager inline) | Inline eager or Redis |
| **Realtime SSE** | Server-Sent Events | Integrated in Django API | Local SSE stream |

---

## 2. Render Blueprint Deployment (One-Click)

The repository provides a production-hardened [`render.yaml`](../render.yaml) blueprint that provisions PostgreSQL, Django Docker backend, and Next.js frontend with automatically cross-linked environment variables.

### Blueprint Steps:
1. Push your repository to GitHub or GitLab.
2. Sign in to [dashboard.render.com](https://dashboard.render.com/).
3. Click **"New +"** $\rightarrow$ **"Blueprint"**.
4. Select the `bill` repository.
5. Render detects [`render.yaml`](../render.yaml) and provisions:
   - **`billmeet-postgres`** (Managed PostgreSQL)
   - **`billmeet-backend`** (Docker Web Service with WeasyPrint libraries)
   - **`billmeet-frontend`** (Node.js Web Service)
6. Click **"Apply"**.
7. Once deployment finishes, obtain your initial superuser credentials from the backend Environment tab (`DJANGO_SUPERUSER_PASSWORD`) and log in at your frontend URL.

---

## 3. Environment Variables Reference

### Backend (`backend/.env` or Render Web Service)

```bash
# Core Environment
ENVIRONMENT=production
DEBUG=False
SECRET_KEY=generate-at-least-50-character-cryptographic-random-string
ALLOWED_HOSTS=.onrender.com,localhost,127.0.0.1,yourdomain.com

# Database Connection
DATABASE_URL=postgres://user:password@hostname:5432/dbname

# CORS and Origins
CORS_ALLOWED_ORIGINS=https://your-frontend.onrender.com
CSRF_TRUSTED_ORIGINS=https://your-frontend.onrender.com
FRONTEND_URL=https://your-frontend.onrender.com

# Asynchronous Tasks & Caching
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2
CELERY_TASK_ALWAYS_EAGER=False  # Set to True on free tier if no Redis instance

# Initial Superuser Bootstrapping
DJANGO_SUPERUSER_EMAIL=admin@digitalbill.local
DJANGO_SUPERUSER_PASSWORD=YourSecurePassword123!
DJANGO_SUPERUSER_FIRST_NAME=Admin

# WhatsApp Cloud API (Optional / Configurable in App UI)
WHATSAPP_ACCESS_TOKEN=your-whatsapp-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-account-id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-webhook-token
```

### Frontend (`frontend/.env.local` or Render Web Service)

```bash
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1
```

---

## 4. Local Deployment with Docker Compose

To run the complete production-mirrored stack locally:

```bash
docker compose up -d --build
```

Services exposed:
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000/api/v1/`
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`

---

## 5. Manual Local Development

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser_if_none_exists
python manage.py runserver 0.0.0.0:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 6. Health & Verification Endpoints

1. **Backend Liveness**: `GET /health/liveness/` $\rightarrow$ `{"status": "ok"}`
2. **Backend Readiness**: `GET /health/` $\rightarrow$ `{"status": "healthy", "database": "ok (...)"}`
3. **Frontend Health**: `GET /login` $\rightarrow$ `HTTP 200`
4. **Automated Test Suite**:
   ```bash
   cd backend && pytest
   cd ../frontend && npm run lint && npm run build
   ```

See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for pre-release verification gates.
