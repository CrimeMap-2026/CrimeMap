# CrimeMap

**Geospatial Crime Intelligence, Analytics & Decision Support** — a local prototype for Puducherry Police Hackathon 2026 (Problem Statement 02).

> **Synthetic demonstration data only.** All incident locations, zone labels, patrol/CCTV overlays and reports are fictional. CrimeMap is **not** a real police platform, validated crime forecast or operational decision-making tool.

## Quick start

Requires **Python 3.11+**, **Node.js/npm**, and Fedora/Linux or macOS for the one-command launcher. On a **first install only**:

```fish
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m app.bootstrap_admin
cd ../frontend
npm install
cd ..
python3 start.py
```

The administrator bootstrap prompts for your own username/password. **Skip it if you already have an account.** On subsequent runs, from the repository root:

```fish
python3 start.py
```

- **Application:** http://127.0.0.1:5173
- **API and interactive docs:** http://127.0.0.1:8000/docs
- **Health check:** http://127.0.0.1:8000/health
- **Stop:** Ctrl+C (stops backend and frontend together)

After updates that change dependencies, run `cd backend && .venv/bin/python -m pip install -r requirements.txt` in the **existing** virtual environment. Don't delete your SQLite database or rebootstrap accounts when updating.

For optional PostgreSQL, security configuration, detailed role permissions, backups and test commands, see [Developer setup](docs/SETUP.md).

## What it does

CrimeMap has **four workspaces**, not a separate screen for every visualization:

| Workspace | Capabilities |
| --- | --- |
| **Incidents** | Search, filter, paginate, create and update synthetic records. Place/drag a map marker to choose coordinates and suggest a nearby **fictional** Demo Zone A–D. **Map** on a record locates and highlights it on the existing map. CSV/JSON import previews validation problems, possible duplicates and warnings before confirmation. |
| **Geospatial Intelligence** | One Leaflet/OpenStreetMap map with **Markers, Heatmap, Grid Analysis and Operations** modes. Fixed-grid count comparisons use equal-length, nonoverlapping periods; Operations overlays are fictional, not live GPS/CCTV feeds. |
| **Analytics** | Counts by category, status, IST date/hour and demonstration zone. Shared filters cover all matching records, not just the visible registry page. **Build presentation PDF** exports selectable analytics, geographic findings and saved prevention-plan summaries. |
| **Prevention Planner** | General safeguarding suggestions from descriptive fictional counts; human-reviewed action plans with status, owner and due date. Completed plans offer a **before/later count review**, not a causal effectiveness claim. |

**Administrator → User management** includes account permissions and an application-level change history of selected successful incident and prevention-plan actions. It is not a tamper-proof audit system.

### Access levels

**Viewer:** records and basic map. **Analyst:** analytics, spatial comparisons, prevention review and PDF. **Officer:** creates/imports incidents and manages prevention plans. **Administrator:** also deletes incidents and manages accounts/audit history. Permissions are enforced by FastAPI, not merely by hiding UI elements.

## Data, imports and persistence

- **Default database:** `backend/crimemap.db` (SQLite). Successfully imported records, accounts and saved plans persist across browser refreshes, sign-outs and server restarts. Optional PostgreSQL uses a **different** database; switching does not transfer SQLite records.
- **Bundled demo data:** `data/synthetic_incidents.csv` contains 100 canonical fictional records with stable `DEMO-` IDs. To add only *missing* seed IDs to the current database, run `cd backend && .venv/bin/python -m scripts.seed_demo`. This is optional, idempotent and **never runs automatically**. Your total can be greater than 100 if you've imported more incidents.
- **Manual import:** Inside **Incidents → Import incident data**, choose a CSV/JSON file (up to **2 MB / 1,000 rows**), inspect the read-only preview and confirm. Invalid rows block the batch; possible duplicates are skipped by default and existing records are not overwritten. Duplicate matching is a **heuristic**: category, UTC occurrence second and coordinates rounded to six decimal places.
- **Sample CSV:** Download it from the import panel, or use `frontend/public/sample-data/synthetic_incidents.csv`. The import also accepts an optional `id` column as **ignored metadata**; newly imported IDs are server-generated. All imported records are labeled `synthetic`.

Required CSV fields (timezone-aware `occurred_at`):

```csv
category,occurred_at,latitude,longitude,police_station,description,status
Theft,2026-10-02T12:30:00+05:30,11.9332,79.8299,Demo Zone A,SYNTHETIC TEST RECORD,reported
```

JSON can contain an array of incident objects, or an object with an `incidents` array. Valid statuses: `reported`, `under_investigation`, `closed`. Allowed categories are defined in `backend/app/schemas.py`.

**Important:** Zone selection is based on approximate fictional reference points, not authorized police-jurisdiction polygons. A displayed grid count or changed incident total does **not** imply a verified hotspot, public safety risk or successful intervention.

## Project layout

```text
CrimeMap/
├── backend/             FastAPI, SQLAlchemy, auth, tests and seed utilities
├── frontend/            React/Vite app and static sample CSV
├── data/                Canonical 100-record synthetic seed
├── docs/
│   ├── SETUP.md         Developer setup, security, database and troubleshooting
│   └── DEMO.md          Five-minute demo and manual QA checklist
├── compose.yaml         Optional local PostgreSQL
└── start.py             Start FastAPI + Vite together
```

## Testing and demo

Run `cd backend && .venv/bin/python -m pytest -q` for backend tests; from `frontend/` run `npm test` and `npm run build`. CI also checks PostgreSQL schema/seed behavior. API route details are available in FastAPI's interactive [local API docs](http://127.0.0.1:8000/docs) when the server is running.

For presenting the complete **Record → Map → Analyse → Prevent → Review → Present** workflow, use the [five-minute demo guide](docs/DEMO.md).

**Deployment warning:** This is a development-only proof of concept. Do not import actual police, victim, witness or operational data; public deployment would require authorization, verified geographic data, production security/privacy controls, proper migrations, backups and independent review.
