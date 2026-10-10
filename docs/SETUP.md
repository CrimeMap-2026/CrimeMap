# CrimeMap — Developer setup and data safety

CrimeMap is a **local-development prototype with fictional incidents**, not a police production system. This guide collects the essential account, database, permissions and maintenance details in one place. For a quick start and feature overview, see [README](../README.md).

## First-time installation

Requirements: Python 3.11+, Node.js/npm. From the repository root:

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

Create the administrator **once, for a new database**, using a username and password you choose when prompted. No default credentials are provided. If your database already has users, **do not bootstrap another administrator**. The app runs at http://127.0.0.1:5173, the API at http://127.0.0.1:8000, API docs at http://127.0.0.1:8000/docs and health at http://127.0.0.1:8000/health. Stop both servers with Ctrl+C.

After pulling an update that changes Python dependencies, refresh the **existing** backend virtual environment:

```fish
cd backend
.venv/bin/python -m pip install -r requirements.txt
cd ..
python3 start.py
```

The launcher does not install dependencies, create accounts, seed incidents or erase existing data.

## Permissions and account security

| Permission | Viewer | Analyst | Officer | Admin |
| --- | :---: | :---: | :---: | :---: |
| Read incidents and view basic maps | Yes | Yes | Yes | Yes |
| Analytics, grid comparison, prevention read/review, PDF | — | Yes | Yes | Yes |
| Create/import incidents, update status, create/edit plans | — | — | Yes | Yes |
| Delete incidents, manage users, view change history | — | — | — | Yes |

The backend enforces roles independently of the visible React buttons. Accounts have no public registration. Administrators manage accounts in **User management**; all users can change their own password in the top bar. Disabling an account, changing its role or resetting its password revokes current sessions. Administrators cannot disable or demote their own account.

Authentication uses an HttpOnly, SameSite=Strict session cookie (up to 8 hours), with only a SHA-256 digest of each opaque token stored server-side. Passwords are salted and hashed with `scrypt`. Failed-login lockout and Origin checks provide limited development safeguards; these are not substitutes for an independently audited production security design.

FastAPI permits same-origin requests and the expected local Vite origins (`http://localhost:5173` and `http://127.0.0.1:5173`) when the API Host is loopback. If changing the frontend origin, set the exact trusted origin via `CRIMEMAP_TRUSTED_ORIGINS`; **do not use wildcard origins**. Real hosting would require HTTPS, a trusted reverse proxy, CSRF defenses, MFA/SSO, security reviews and hardened operational controls.

## Databases and persistence

**SQLite is the default.** Data lives in `backend/crimemap.db` and persists across page refreshes, sign-outs and restarts. It includes synthetic incidents, accounts, sessions, human-reviewed prevention plans and change history. Pulling frontend/backend code does not replace the database.

For diagnostics and idempotent demo fixture top-up, from `backend/`:

```fish
.venv/bin/python -m scripts.db_status
.venv/bin/python -m scripts.seed_demo
```

The seed script adds only missing canonical `DEMO-0001` through `DEMO-0100` records from `data/synthetic_incidents.csv`. It does **not** delete or overwrite manually created/imported records, account details or saved plans. It never runs automatically on startup. The downloadable sample CSV is for **manual import**, which creates new random IDs and runs duplicate checks; it is not an alternative migration or reseeding procedure.

For a simple SQLite backup, stop the backend and copy `backend/crimemap.db` somewhere private. Never commit the database or `.env` to Git.

### Optional PostgreSQL 17

PostgreSQL uses a **separate database**. Switching does *not* copy your existing SQLite data or administrator account.

1. From the project root, `cp .env.example .env`, choose a long unique `POSTGRES_PASSWORD` (do not commit `.env`), then run `docker compose up -d db`.
2. From `backend/` in your Fish terminal, configure the database URL:
   ```fish
   set -gx DATABASE_URL 'postgresql+psycopg://crimemap_dev:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/crimemap'
   .venv/bin/python -m scripts.db_status
   ```
   URL-encode password special characters. Use the database/user/port from your `.env` if you changed the defaults.
3. On a **brand-new** PostgreSQL database only, run ` .venv/bin/python -m app.bootstrap_admin`, then (optionally) ` .venv/bin/python -m scripts.seed_demo`. Start the API with `python3 start.py` from the repository root **only if the launcher inherits the same `DATABASE_URL`**.

To return to SQLite in that shell, `set -e DATABASE_URL`, then restart the backend. Do **not** run `docker compose down -v` unless deliberately deleting your PostgreSQL volume. Neither database is migrated automatically.

The local application uses `Base.metadata.create_all` for **additive missing tables**, not versioned migrations; it does not drop existing records on startup. Production deployment would need versioned migrations, backups and disaster recovery procedures.

## Data and audit boundaries

All records bundled with this project, including geographic coordinates, incident types, CCTV locations, road accidents and patrol tracks, are fabricated. Approximate Demo Zone A–D suggestions use **fictional reference points**, not official police boundaries. Grid concentrations, temporal comparisons and prevention count reviews describe the dataset; they do **not** validate crime predictions or prevention effects.

The administrator's **User management → Change history** view records successful app-level incident create/edit/delete/import and prevention-plan create/edit events. Entries are committed in the **same transaction** as the modified record, with a UTC timestamp, actor snapshot and minimal field indicators. Login attempts, account changes and changes made before auditing existed are not included. The history is **not immutable/tamper-proof** and is not production-grade. Passwords, session tokens and free-text descriptions/notes are not copied to the audit event details.

Uploaded CSV/JSON is synthetic only: up to **1,000 rows / 2 MB**, with timezone-aware ISO 8601 timestamps. The preview is read-only. Confirmed imports validate the entire file again, skip possible duplicates by default and commit eligible rows. Matching uses category, UTC second and rounded coordinates; this is a heuristic, not verified incident identity.

**Never use this prototype with real police, victim, witness or operational information.** Before production, obtain authorization and introduce data governance, HTTPS, MFA/SSO, independently protected audit logs, retention controls, backups, vulnerability reviews, and verified geographic boundary data.

## Tests and useful endpoints

```fish
cd backend
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
cd ../frontend
npm test
npm run build
```

The API is documented at `/docs`. Useful routes: `/health`, `/api/incidents`, `/api/incidents/import/preview`, `/api/map/incidents`, `/api/analytics/overview`, `/api/hotspots/grid`, `/api/hotspots/compare`, `/api/prevention/insights`, `/api/prevention/plans`, `/api/prevention/plans/{id}/review`, `/api/reports/presentation`, `/api/admin/audit`, and `/api/admin/users`. All `/api/` routes except sign-in and other public auth operations require the appropriate session/role.

CI runs the backend suite, frontend tests/build and PostgreSQL schema/seed checks. Passing CI does **not** substitute for manual cross-device accessibility checks or production security assessment. See [Demo checklist](DEMO.md).
