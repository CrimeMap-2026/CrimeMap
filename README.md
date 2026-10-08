# CrimeMap — Module 01: Crime Incident Management

A module-by-module prototype for **Problem Statement 02: Geospatial Crime Intelligence, Analytics & Decision-Support System**. This version is **for local development only**.

> **Data warning:** Every bundled incident is **synthetic**. The coordinates, incident types, zones, and timestamps were invented to test application behavior. They do **not** describe real Puducherry crimes. Do not use this build for operational policing or public crime claims.

## Included in Module 01

- FastAPI REST API for incident create, read, list/filter, status update, and deletion.
- CSV/JSON import with strict record validation. A rejected row aborts the entire import.
- SQLAlchemy storage with SQLite by default and PostgreSQL support via `DATABASE_URL`.
- React/Vite incident-management screen with filters, pagination, add form, import, and status updates.
- Synthetic sample CSV with 36 records, plus an idempotent demo seed script.
- API tests for CRUD, UTC conversion, field validation, atomic imports, filters, and pagination.

## Start the backend

Use Python 3.11+:

```bash
cd backend
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m scripts.seed_demo
uvicorn app.main:app --reload --port 8000
```

The API is at `http://127.0.0.1:8000` and the Swagger documentation is at `http://127.0.0.1:8000/docs`.

`crimemap.db` is created in the `backend/` directory automatically on first startup or seeding. Running the seed script multiple times won't duplicate the 36 demo records.

### Optional PostgreSQL

Set `DATABASE_URL` before starting the backend (PostGIS is optional until a later geospatial module):

```bash
export DATABASE_URL='postgresql+psycopg://username:password@localhost:5432/crimemap'
```

The database must exist; the app creates its `incidents` table automatically for this prototype. Use versioned migrations before production deployment.

## Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` calls to the backend at port 8000.

## Run API tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest -q
```

## Import file format

CSV headers:

```csv
category,occurred_at,latitude,longitude,police_station,description,status
Vehicle Theft,2026-09-12T21:30:00+05:30,11.9345,79.8302,Demo Zone A,SYNTHETIC TEST RECORD,reported
```

JSON can be an array of objects with these fields or `{ "incidents": [ ... ] }`. The ISO 8601 `occurred_at` timestamp **must include a timezone**, for example `+05:30` or `Z`. Valid statuses: `reported`, `under_investigation`, and `closed`. Valid categories are listed in `backend/app/schemas.py`.

For demonstration safety, the API **always** sets `source_type` to `synthetic`, never to `official`, including imported records. Files may contain up to 1,000 rows / 2 MB. Imports are transactional.

## API endpoints

| Method | URL | Description |
| --- | --- | --- |
| GET | `/health` | API health check |
| GET | `/api/incidents` | List with category, status, search (`q`), limit, offset |
| POST | `/api/incidents` | Create a synthetic incident |
| GET | `/api/incidents/{id}` | Get one incident |
| PATCH | `/api/incidents/{id}` | Change status and/or description |
| DELETE | `/api/incidents/{id}` | Delete an incident |
| POST | `/api/incidents/import` | Upload CSV or JSON as multipart `file` |

## Folder structure

```text
CrimeMap/
├── backend/
│   ├── app/             # FastAPI, SQLAlchemy, validation
│   ├── scripts/         # Idempotent synthetic-data seeder
│   └── tests/           # API tests
├── frontend/
│   ├── public/          # Example downloadable CSV
│   └── src/             # React UI
├── data/                # Synthetic demonstration records
└── README.md
```

## Security and future modules

This MVP intentionally has **no authentication** and supports only synthetic records. Before using any real police data, implement officer authentication, role-based permissions, audit logs, encryption, retention/access policies, and written authorization. Avoid storing victim/witness names or addresses in the demo. A future authorized import pipeline must explicitly identify provenance and prevent unverified records being presented as official.

**Next:** Module 02 can read `GET /api/incidents` to build Leaflet incident markers, clusters, and filters. The API's `limit` is capped at 200; large geospatial datasets will require a dedicated bounded map query or tiles rather than loading everything into the browser.
