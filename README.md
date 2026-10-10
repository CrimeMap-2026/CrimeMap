# CrimeMap — Four Workspaces: Incidents, Geospatial Intelligence, Analytics & Prevention

A module-by-module prototype for **Problem Statement 02: Geospatial Crime Intelligence, Analytics & Decision-Support System**. This version is **for local development only**.

> **Data warning:** Every bundled incident is **synthetic**. The coordinates, incident types, zones, and timestamps were invented to test application behavior. They do **not** describe real Puducherry crimes. Do not use this build for operational policing or public crime claims.

## One-command development launcher (Fedora / Fish)

Once you've installed the backend Python environment and frontend npm dependencies, start **both FastAPI and Vite** in one terminal from the repository root:

```fish
cd ~/Documents/Repos/CrimeMap-work
python3 start.py
```

The launcher finds the repository root automatically, uses `backend/.venv/bin/python`, starts FastAPI at `http://127.0.0.1:8000` and Vite at `http://127.0.0.1:5173`, streams both logs to the same terminal, and **stops both (including reload processes) when you press Ctrl+C**. It reserves Vite port 5173 rather than silently switching to another port, which keeps the local login origin check consistent.

For first-time setup only:

```fish
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cd ../frontend
npm install
cd ..
python3 start.py
```

The launcher does not automatically seed or erase data, create administrator accounts, install dependencies, or start the optional PostgreSQL Docker service. Your existing SQLite database and account are preserved. You can still start each server manually using the steps below.

## Authorization and access levels

CrimeMap now requires an account to use its API and UI. There are four backend-enforced roles: **Viewer** (read-only incidents and basic maps), **Analyst** (plus statistics/grid analysis), **Officer** (plus create/import/status updates), and **Administrator** (plus deletion and user management). Authentication uses revocable HttpOnly cookie sessions; the frontend shows only permitted controls, while the FastAPI routes enforce access on every request.

**First run:** in `backend/`, after activating the Python environment, execute `python -m app.bootstrap_admin` and choose your own password. No default admin accounts or credentials are included. Then launch FastAPI and Vite and sign in. Administrators can create other users through **User management**.

**Development-only security:** Do not expose the project to the internet or import real law-enforcement records. See [AUTHORIZATION.md](AUTHORIZATION.md) for the permissions matrix, setup instructions, technical details, and requirements before any operational deployment.

## Built-in change history (Administration)

The existing **User Management** page now contains an administrator-only **Change history** panel with record-type filtering, pagination and timestamps. FastAPI writes application-level audit entries for successful incident create/edit/delete/import operations and prevention-plan creation/edits, including the responsible account and minimal field-change indicators. Events are stored in a separate table **in the same transaction** as the changes. Free-text notes and passwords are never logged. This history starts from the upgrade forward; it is not tamper-proof or production-grade.

See [AUTHORIZATION.md](AUTHORIZATION.md) and [DATABASE.md](DATABASE.md) for endpoint, privacy and SQLite/PostgreSQL details.

## Module 04 — Prevention & Action Planner

CrimeMap now has a distinct **Prevention planner** page that addresses the "Prevent" part of the hackathon statement without confusing it with an automated crime-prediction model.

- Explore **descriptive observations** grouped by demonstration zone and crime category, with an optional date range. Cards show exact fictional incident counts, the selected share, and two category-specific general safeguarding measures.
- Example prevention options: home/vehicle security awareness, cyber-fraud literacy, victim support information, lighting and maintenance assessments, and voluntary community safety education.
- Officers and Administrators can **create and track prevention action plans** with a coordinator, due date, rationale/evidence snapshot, progress notes and status transitions; Analysts can view/export but cannot modify proposals.
- Use **Print summary** for a presentation-ready printable overview or export the saved plan board as CSV.
- All plan and analytics endpoints enforce permissions in FastAPI; plans are persisted in a new SQLAlchemy table. Existing accounts and incident records remain unchanged.
- These are synthetic demonstration proposals for human review — **not verified risk predictions, patrol instructions or proven reductions in crime**. See [MODULE04.md](MODULE04.md) for presentation instructions and limitations.

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
   - **Compare periods (within Grid Analysis):** Compare equal-length, non-overlapping local date ranges using the same cells and threshold. Highlight fictional cells newly above threshold, above threshold in both periods, or falling below it; select cells to inspect count changes and export the comparison. This is descriptive, not crime prediction.
4. **Operations:** Same map, with toggles for incident points, fictional road accidents, hypothetical CCTV positions and simulated patrol tracks. A timeline slider displays historical demonstration patrol snapshots; selecting a synthetic incident compares straight-line distance to the nearest fictional unit.

Category and status filters apply to incident layers. Grid controls affect grid results; operational layer toggles and timeline affect Operations mode. All maps and visualizations remain clearly labelled **synthetic demonstration data**, not real public-safety intelligence, CCTV feeds, active GPS, geofencing or dispatch capabilities.

The separate Operations navigation item, standalone React page and its duplicated Leaflet map have been removed. The `/api/operations/overview` endpoint remains read-only and is reused as an overlay source. There are no database schema changes.

The map also offers links to official Puducherry Police directory/statistics and citizen services; these are *external links*, not police integrations. See [MODULE02.md](MODULE02.md) and [PUBLIC_POLICE_PORTAL_RESEARCH.md](PUBLIC_POLICE_PORTAL_RESEARCH.md).

## Included in Module 01

- FastAPI REST API for incident create, read, list/filter, status update, and deletion.
- **Smart CSV/JSON import preview** within Incident Management: review each row before saving, including validation errors, possible duplicates against existing database rows or earlier rows in the file, and nonblocking demonstration-grid/zone warnings. Invalid rows block confirmation; eligible rows import on explicit confirmation while duplicates are skipped. The original strict import endpoint remains backward-compatible.
- SQLAlchemy storage with SQLite by default and PostgreSQL support via `DATABASE_URL`.
- React/Vite incident-management screen with filters, pagination, **click-and-drag map location picker inside Add Incident**, import, and status updates. Placing, dragging, or centering the pin automatically fills latitude/longitude **and suggests a fictional Demo Zone A–D** based on the nearest demo reference point within 3.5 km. You can manually override the zone; moving/clearing the pin clears outdated zone values. Outside the demo reference area, no zone is guessed. **This is a prototype heuristic, not an official police-station or administrative boundary lookup.** A keyboard-accessible **Use map center** option is included, and saving requires a selected location.
- A 100-record synthetic dataset (original 36 plus 64 new fictional samples), with an idempotent seed script.
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

SQLite is **already a database**: `crimemap.db` is created in `backend/` on startup, alongside account, session and prevention-action tables. Existing incident records and administrator accounts are preserved when pulling new code.

To fill any missing demonstration records (including the 64 new records), stop at least any simultaneous seed process and run from `backend/`:

```bash
python -m scripts.seed_demo
python -m scripts.db_status
```

The seed command adds only **missing** stable fixture IDs (`DEMO-0001` through `DEMO-0100`). It does not wipe the database, overwrite edited fixture records or change accounts. On a database containing the original 36 unmodified fixture IDs, it adds 64 for a total of **100**. If you also have extra manually added/imported incidents, your database total may be **more than 100**. Seeding is explicit rather than automatic on startup.

The downloadable sample CSV contains 100 records but its normal **Import** operation creates new IDs each time; for updating existing seeded databases, prefer the idempotent command above rather than re-importing the CSV.

### Optional PostgreSQL development database

SQLite remains the default. CrimeMap already supports PostgreSQL through SQLAlchemy's `DATABASE_URL`. An optional `compose.yaml` now starts **PostgreSQL 17** on your local computer, using a password that you choose in an untracked `.env` file, a persistent Docker volume, a readiness check, and a loopback-only port binding.

**PostgreSQL is a separate database, not an automatic conversion of your SQLite records or accounts.** To switch, set `DATABASE_URL` before running the admin bootstrap, seed script and API; if you don't set it, nothing changes. Do not delete `backend/crimemap.db` when trying PostgreSQL. Detailed Fish/Linux steps, verification and troubleshooting are in [DATABASE.md](DATABASE.md). PostGIS and formal versioned schema migrations remain future work.

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

Both the import preview and confirmed import recognize the optional `id` column in the bundled `data/synthetic_incidents.csv` (e.g. `DEMO-0001`). It is **read-only source metadata**, not a client-assigned record ID: imported new records receive server-generated IDs, and possible matches already seeded in the database are shown as duplicates. Unrecognized extra columns remain invalid. The bundled CSV is not defective and does not need manual editing.

For demonstration safety, the API **always** sets `source_type` to `synthetic`, never to `official`, including imported records. Files may contain up to 1,000 rows / 2 MB. Imports are transactional.

**Import workflow:** Open **Incidents → Import incident data → Choose file**. A read-only preview displays all rows' statuses, a count of ready/duplicate/invalid rows and optional warnings. Fix any invalid row in the source file and reselect it. If the remaining records look correct, click **Import new records**. The confirmed import revalidates the upload and skips potential duplicates by default. Nothing is written during preview; uploads do not modify the existing 100 seeded records.

**Duplicate rule:** A possible duplicate has the same category, UTC occurrence second and latitude/longitude rounded to six decimal places. This is intentionally conservative and not a guaranteed incident identity: different events could share those values, and events with slightly different time/locations won't be flagged. Duplicate matches are never automatically merged or overwritten. When using the API directly, `POST /api/incidents/import?skip_duplicates=true` opts into safe skipping; omitting the query parameter preserves the legacy importer. Preview and import both require Officer or Administrator permissions.

## API endpoints

| Method | URL | Description |
| --- | --- | --- |
| GET | `/health` | API health check |
| GET | `/api/incidents` | List with category, status, search (`q`), limit, offset |
| POST | `/api/incidents` | Create a synthetic incident |
| GET | `/api/incidents/{id}` | Get one incident |
| PATCH | `/api/incidents/{id}` | Change status and/or description |
| DELETE | `/api/incidents/{id}` | Delete an incident |
| POST | `/api/incidents/import/preview` | Read-only validated row preview with duplicate and warning classifications (Officer+) |
| POST | `/api/incidents/import` | Transactional CSV/JSON upload; `skip_duplicates=true` skips possible duplicate records (Officer+) |
| GET | `/api/map/incidents` | Bounding-box GeoJSON with category/status filters, up to 2,000 points |
| GET | `/api/analytics/overview` | Complete filtered summary and category/status/date/hour/zone aggregates |
| GET | `/api/analytics/filters` | Category/status choices and distinct synthetic demonstration zones |
| GET | `/api/hotspots/grid` | Synthetic grid-cell counts, ranks, bounds, and GeoJSON features |
| GET | `/api/hotspots/compare` | Synthetic before/after grid counts in identical cells (Analyst or higher) |
| GET | `/api/admin/audit` | Administrator-only paginated change history for synthetic incidents and prevention plans |
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
├── data/                # 100 synthetic demonstration records
├── compose.yaml          # Optional local PostgreSQL service
├── .env.example          # Non-secret DB settings template
└── README.md
```

## Security and future modules

This prototype has cookie-based authentication and four backend-enforced authorization levels, but **is not production-ready** and supports only fictional records. Before any real police data: implement an independently reviewed security design, MFA/centralized identities, tamper-resistant comprehensive audit infrastructure, encrypted transport and backups, retention/access policies, and written authorization. Avoid collecting victim/witness names or addresses in the demonstration. See [AUTHORIZATION.md](AUTHORIZATION.md).

**Next:** A consistent date filter on map modes, additional data-quality review, production-grade audit trails, and verified infrastructure data can be developed as distinct future features. No live police system is connected. For very large datasets, replace the bounded map query with PostGIS spatial indexing and vector tiles.
