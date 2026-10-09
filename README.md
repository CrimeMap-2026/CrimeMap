# CrimeMap — Three Workspaces: Incidents, Geospatial Intelligence & Analytics

A module-by-module prototype for **Problem Statement 02: Geospatial Crime Intelligence, Analytics & Decision-Support System**. This version is **for local development only**.

> **Data warning:** Every bundled incident is **synthetic**. The coordinates, incident types, zones, and timestamps were invented to test application behavior. They do **not** describe real Puducherry crimes. Do not use this build for operational policing or public crime claims.

## Authorization and access levels

CrimeMap now requires an account to use its API and UI. There are four backend-enforced roles: **Viewer** (read-only incidents and basic maps), **Analyst** (plus statistics/grid analysis), **Officer** (plus create/import/status updates), and **Administrator** (plus deletion and user management). Authentication uses revocable HttpOnly cookie sessions; the frontend shows only permitted controls, while the FastAPI routes enforce access on every request.

**First run:** in `backend/`, after activating the Python environment, execute `python -m app.bootstrap_admin` and choose your own password. No default admin accounts or credentials are included. Then launch FastAPI and Vite and sign in. Administrators can create other users through **User management**.

**Development-only security:** Do not expose the project to the internet or import real law-enforcement records. See [AUTHORIZATION.md](AUTHORIZATION.md) for the permissions matrix, setup instructions, technical details, and requirements before any operational deployment.

## Module 03 — Crime Analytics Dashboard

- Open **Analytics** in the existing sidebar on desktop, tablet, or mobile.
- Four summary cards and five charts cover matching incidents, categories, statuses, local occurrence dates/hours, and demonstration zones.
- Filter by inclusive IST date range, category, status, and named or unspecified zone. Every chart uses the same database filters, without pagination limits.
- All views are labeled **SYNTHETIC DEMONSTRATION DATA**, with loading, retry, empty states, and accessible chart data tables.
- Analytics is read-only; no schema migration, reseeding, or database replacement is needed. See [MODULE03.md](MODULE03.md) for API semantics and validation details.

## Module 02 — Geospatial Intelligence (single map)

The **Geospatial Intelligence** workspace uses one Leaflet/OpenStreetMap instance and four switchable modes:

1. **Markers:** Individual incident points, clusters, popups and visible incident list.
2. **Heatmap:** Descriptive density of synthetic incident points.
3. **Grid analysis:** Backend-computed fixed-square counts, density, ranks, date/zone/threshold controls and GeoJSON export.
4. **Operations:** Same map, with toggles for incident points, fictional road accidents, hypothetical CCTV positions and simulated patrol tracks. A timeline slider displays historical demonstration patrol snapshots; selecting a synthetic incident compares straight-line distance to the nearest fictional unit.

Category and status filters apply to incident layers. Grid controls affect grid results; operational layer toggles and timeline affect Operations mode. All maps and visualizations remain clearly labelled **synthetic demonstration data**, not real public-safety intelligence, CCTV feeds, active GPS, geofencing or dispatch capabilities.

The separate Operations navigation item, standalone React page and its duplicated Leaflet map have been removed. The `/api/operations/overview` endpoint remains read-only and is reused as an overlay source. There are no database schema changes.

The map also offers links to official Puducherry Police directory/statistics and citizen services; these are *external links*, not police integrations. See [MODULE02.md](MODULE02.md) and [PUBLIC_POLICE_PORTAL_RESEARCH.md](PUBLIC_POLICE_PORTAL_RESEARCH.md).

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
source .venv/bin/activate  # Bash / Zsh. Fish: source .venv/bin/activate.fish
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

The API is at `http://127.0.0.1:8000` and the Swagger documentation is at `http://127.0.0.1:8000/docs`.

`crimemap.db` is created in the `backend/` directory automatically on first startup. Keep your existing database when upgrading modules. For a **new development database only**, you can optionally run `python -m scripts.seed_demo`; it won't duplicate the bundled 36 demo IDs.

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
| GET | `/api/map/incidents` | Bounding-box GeoJSON with category/status filters, up to 2,000 points |
| GET | `/api/analytics/overview` | Complete filtered summary and category/status/date/hour/zone aggregates |
| GET | `/api/analytics/filters` | Category/status choices and distinct synthetic demonstration zones |
| GET | `/api/hotspots/grid` | Synthetic grid-cell counts, ranks, bounds, and GeoJSON features |
| GET | `/api/operations/overview` | Static fictional CCTV, accident and patrol track overlays for Module 02 |

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

**Next:** Authorized accounts, field data workflows, verified infrastructure data, and validated spatial/decision-support methods may be developed as distinct future modules. No live police system is connected. For very large datasets, replace the bounded map query with PostGIS spatial indexing and vector tiles.
