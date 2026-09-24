# Steps to Run the Project

## Prerequisites
- **Python 3.10+** (with virtual environment at `backend/venv`)
- **Node.js 18+** & **npm**

---

## 1. Start Backend (Django API)

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python manage.py runserver 127.0.0.1:8000
```
- API Base URL: `http://127.0.0.1:8000`
- Django Admin: `http://127.0.0.1:8000/admin/`

---

## 2. Start Frontend (Next.js)

```powershell
cd frontend
npm run dev
```
- Web Application: `http://localhost:3000`

---

## 3. Environment Configuration

- **Backend Configuration**: Located at [`.env`](file:///d:/Digitalbill-dpramp/.env) or `backend/.env`.
- **Frontend API Endpoint**: Configured in `.env` as `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`.

---

## 4. Default Admin Credentials

- **Email**: `admin@billfree.com`
- **Password**: `admin123`
- **Django Admin Portal**: [`http://127.0.0.1:8000/admin/`](http://127.0.0.1:8000/admin/)
- **Frontend Login**: [`http://localhost:3000/login`](http://localhost:3000/login)
