# Render Deployment Guide: BillMeet SaaS

This guide explains how to deploy the **BillMeet SaaS** platform (Django REST Backend + Next.js Frontend + PostgreSQL Database) to [Render](https://render.com/).

---

## Architecture Overview

| Component | Technology | Render Service Type | Plan |
| :--- | :--- | :--- | :--- |
| **Database** | PostgreSQL 16 | Render Managed PostgreSQL | Free / Starter |
| **Backend API** | Django 5.1 + Gunicorn + WhiteNoise | Web Service (Docker) | Free / Starter |
| **Frontend UI** | Next.js 14 (App Router) | Web Service (Node) | Free / Starter |
| **Background Tasks** | Celery (inline or async) | Built-in Eager / Background Worker | Free / Starter |

---

## Method 1: One-Click Blueprint Deployment (Recommended)

This repository includes a production-tested [`render.yaml`](./render.yaml) Blueprint that provisions the database, backend, and frontend automatically with all environment variables cross-linked.

### Steps:
1. **Push your code to GitHub or GitLab**.
2. Log in to [dashboard.render.com](https://dashboard.render.com/).
3. Click **"New +"** in the top navigation and select **"Blueprint"**.
4. Connect your GitHub/GitLab repository.
5. Render will detect [`render.yaml`](./render.yaml) and display the execution plan:
   - **`billmeet-postgres`** (PostgreSQL Database)
   - **`billmeet-backend`** (Web Service, Docker)
   - **`billmeet-frontend`** (Web Service, Node)
6. Click **"Apply"**.
7. Render will automatically build the images, run migrations, collect static files, and wire up the services.
8. Once finished, retrieve the superuser password:
   - Open **`billmeet-backend`** -> **"Environment"** tab.
   - Look for the generated value for `DJANGO_SUPERUSER_PASSWORD`.
   - Log in at `https://<your-frontend-service>.onrender.com/login` using `admin@digitalbill.local` and your password.

---

## Method 2: Manual Step-by-Step Deployment

If you prefer to configure each service manually in the Render dashboard:

### Step 1: Create the PostgreSQL Database
1. In Render Dashboard, click **"New +"** -> **"PostgreSQL"**.
2. **Name**: `billmeet-postgres`
3. **Database**: `digitalbill_db`
4. **User**: `digitalbill_user`
5. **Plan**: Free (or Starter)
6. Click **"Create Database"**.
7. Copy the **Internal Database URL** (e.g. `postgres://digitalbill_user:...@dpg-...:5432/digitalbill_db`).

---

### Step 2: Deploy the Backend API
1. Click **"New +"** -> **"Web Service"**.
2. Connect your repository.
3. Configure the service:
   - **Name**: `billmeet-backend`
   - **Language**: `Docker`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Build Context**: `backend`
   - **Health Check Path**: `/health/liveness/`
4. In the **Environment Variables** section, add:

| Key | Value / Source | Description |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `production` | Production mode |
| `DEBUG` | `False` | Disables debug mode |
| `SECRET_KEY` | *(Click "Generate" for 32+ char key)* | Django crypto key |
| `DATABASE_URL` | *(Paste Internal Database URL from Step 1)* | Database connection |
| `ALLOWED_HOSTS` | `.onrender.com,localhost,127.0.0.1` | Allowed domain names |
| `CELERY_TASK_ALWAYS_EAGER` | `True` | Runs Celery inline on Free Tier |
| `PILOT_MODE` | `True` | Pilot verification mode |
| `DJANGO_SUPERUSER_EMAIL` | `admin@digitalbill.local` | Initial admin email |
| `DJANGO_SUPERUSER_PASSWORD` | *(Your choice or Generate)* | Initial admin password |
| `DJANGO_SUPERUSER_FIRST_NAME` | `Admin` | Initial admin name |
| `FRONTEND_URL` | *(Leave empty until Step 3, then set)* | Frontend origin |
| `CORS_ALLOWED_ORIGINS` | *(Leave empty until Step 3, then set)* | Allowed CORS origin |

5. Click **"Create Web Service"**.
6. Note the public URL (e.g. `https://billmeet-backend.onrender.com`).

> [!NOTE]
> Why Docker for the Backend?
> Django uses **WeasyPrint** for PDF invoice generation, which depends on native system libraries (`libpango`, `libharfbuzz`). The provided `backend/Dockerfile` bundles these libraries cleanly so invoice generation works out of the box.

---

### Step 3: Deploy the Frontend UI
1. Click **"New +"** -> **"Web Service"**.
2. Connect your repository.
3. Configure the service:
   - **Name**: `billmeet-frontend`
   - **Language**: `Node`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/login`
4. In the **Environment Variables** section, add:

| Key | Value |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_API_URL` | `https://billmeet-backend.onrender.com/api/v1` |

5. Click **"Create Web Service"**.
6. Copy your frontend URL (e.g. `https://billmeet-frontend.onrender.com`).

---

### Step 4: Finalize Cross-Origin Configuration
Return to the **`billmeet-backend`** settings on Render and set:
- `FRONTEND_URL`: `https://billmeet-frontend.onrender.com`
- `CORS_ALLOWED_ORIGINS`: `https://billmeet-frontend.onrender.com`
- `CSRF_TRUSTED_ORIGINS`: `https://billmeet-frontend.onrender.com`

Render will automatically restart the backend with the new origins.

---

## Verifying the Deployment

1. **Backend Liveness**:
   Visit `https://<backend-url>/health/liveness/` — should return HTTP 200 with `{"status": "ok"}`.
2. **Backend Readiness**:
   Visit `https://<backend-url>/health/` — should return HTTP 200 validating DB connectivity.
3. **Django Admin**:
   Visit `https://<backend-url>/admin/` — log in with your superuser credentials.
4. **Frontend Dashboard**:
   Visit `https://<frontend-url>/login` — log in and access POS, Inventory, and Analytics.

---

## Production Upgrades & Scaling

### 1. Dedicated Celery Worker & Redis
On Render Free Tier, `CELERY_TASK_ALWAYS_EAGER=True` executes tasks synchronously inside the web process. When upgrading to asynchronous task processing:
1. Create a **Redis** instance on Render or Upstash.
2. Set `REDIS_URL` on the backend.
3. Set `CELERY_TASK_ALWAYS_EAGER=False`.
4. Create a Render **Background Worker**:
   - **Runtime**: `Docker` (same context as backend)
   - **Start Command**: `celery -A config worker -l info --concurrency=2 -Q celery,critical,notifications,whatsapp,campaigns,reports,analytics,automation`

### 2. Persistent Media Storage (AWS S3 or Cloudflare R2)
Render's container filesystem is ephemeral on restarts. For persistent customer receipts and store logos, configure S3/R2:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_STORAGE_BUCKET_NAME`
- `AWS_S3_REGION_NAME`
- `AWS_S3_ENDPOINT_URL` (optional, for Cloudflare R2 / MinIO)
