# CrimeMap — Modules 01–04: Incident Management, Spatial Map, Analytics & Demo Operations

A module-by-module prototype for **Problem Statement 02: Geospatial Crime Intelligence, Analytics & Decision-Support System**. This version is **for local development only**.

> **Data warning:** Every bundled incident is **synthetic**. The coordinates, incident types, zones, and timestamps were invented to test application behavior. They do **not** describe real Puducherry crimes. Do not use this build for operational policing or public crime claims.

## Module 04 — Synthetic Operational Overview (IPMCAP-inspired)

- A new **Operations** sidebar page combines crime incidents, fictional accident points, hypothetical CCTV locations and simulated patrol history on a single OpenStreetMap/Leaflet map.
- Toggle each layer independently; filter incident markers by category/status and pan/zoom the map to fetch viewport records from the existing incident API.
- Drag the **patrol history** slider to view seven timestamped sample locations per fictional patrol, including an illustrative route trace.
- Click a synthetic incident marker to inspect the straight-line distance to the nearest **demo** patrol position at the selected timeline snapshot. This is not road distance, travel time, dispatch guidance or a recommendation.
- Four summary cards describe incident totals in the visible map area and the numbers of example patrols, cameras and accidents.
- Read-only `GET /api/operations/overview` returns **static synthetic fixtures**: no real GPS, CCTV, accident services, emergency integrations, surveillance, authenticated accounts, or live status feeds.
- Adapted from public **IPMCAP** feature descriptions (https://ipmcap.tspolice.gov.in/), not its private code or authenticated internal screens. See [MODULE04.md](MODULE04.md).

## Module 03 — Crime Analytics Dashboard

- Open **Analytics** in the existing sidebar on desktop, tablet, or mobile.
- Four summary cards and five charts cover matching incidents, categories, statuses, local occurrence dates/hours, and demonstration zones.
- Filter by inclusive IST date range, category, status, and named or unspecified zone. Every chart uses the same database filters, without pagination limits.
- All views are labeled **SYNTHETIC DEMONSTRATION DATA**, with loading, retry, empty states, and accessible chart data tables.
- Analytics is read-only; no schema migration, reseeding, or database replacement is needed. See [MODULE03.md](MODULE03.md) for API semantics and validation details.

## Module 02 — Crime Map & Spatial Analysis

- A **single Leaflet map** switches between markers/clusters, a visual density heatmap and fixed-grid concentration analysis.
- Category/status filters are shared across all three modes; grid analysis also supports IST date range, demonstration zone, cell size and minimum-count threshold.
- Grid analysis retains ranked cells, nominal per-km² density, metadata, map focus and GeoJSON export, all calculated server-side using the existing `GET /api/hotspots/grid` endpoint.
- Markers and heatmap continue to request GeoJSON for the current viewport using `GET /api/map/incidents`; the grid uses a fixed rectangular demonstration extent instead of the viewport.
- Navigation includes **Incidents**, **Map & spatial analysis**, **Analytics**, and **Operations**; there is no duplicate Hotspots page.
- Text sizes and contrast were increased across the dashboard, map, forms, tables and analytics charts.
- Every visualization and concentration rank describes synthetic records only — **not validated hotspots, crime risks, or predictions**. See [MODULE02.md](MODULE02.md) for implementation details.

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
| GET | `/api/operations/overview` | Static read-only fictional CCTV, accident and patrol track data |

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

**Next:** Future modules can add authenticated data workflows, GPS/asset integrations, validated alerting and appropriately validated predictive modeling and decision support, with documented limitations and synthetic demonstration data until authorized records are available. For very large datasets, replace the bounded map query with PostGIS spatial indexing and vector tiles.
