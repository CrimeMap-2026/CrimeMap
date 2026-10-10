# CrimeMap Databases — SQLite and Optional PostgreSQL

CrimeMap **already uses a relational database** through SQLAlchemy. SQLite is the default, backed by the local `backend/crimemap.db` file. It stores incidents, user accounts, authorization roles and revocable login sessions.

PostgreSQL is optional for local experiments with a separate, more scalable database. No database settings or existing records are changed merely by fetching the code. There is **no automatic migration** between SQLite and PostgreSQL.

> This is a synthetic-data development prototype. Do not expose its development database or auth setup to the internet or put actual police records in it.

## Option A — Keep SQLite (recommended for now)

From the `backend` folder, after activating the Python virtual environment:

```fish
python -m scripts.db_status
python -m scripts.seed_demo
python -m scripts.db_status
```

The status command is read-only and reports the configured database provider and table row counts without showing credentials. The seed command imports only **missing** `DEMO-0001` through `DEMO-0100` IDs from `data/synthetic_incidents.csv` and never overwrites existing records. For an existing database seeded with the original 36 fixture IDs, the seed adds **64** more. Locally created records remain untouched; your final count may be greater than 100 if you already imported or created extra incidents.

Neither command is run automatically when the server starts.

For a simple local backup, **stop the backend** and copy `backend/crimemap.db` to a private location. Never commit this database to GitHub; it may contain local account credentials (in hashed form) and session metadata.

## Option B — Use PostgreSQL 17 with Docker (optional)

Requires Docker Engine/Compose running locally. From the **repository root**:

```fish
cd ~/Documents/Repos/CrimeMap-work
cp .env.example .env
nano .env
```

Set `POSTGRES_PASSWORD` to a long, unique password. Use URL-safe letters and numbers for ease of passing it to SQLAlchemy later. Leave `POSTGRES_DB=crimemap`, `POSTGRES_USER=crimemap_dev` and `POSTGRES_PORT=5432` unless necessary to change them.

`.env` is ignored by Git. `.env.example` intentionally contains **no credentials**.

Start and check the service:

```fish
docker compose up -d db
docker compose ps
```

PostgreSQL listens only on `127.0.0.1:5432` on your host and stores its data in a Docker named volume. You can stop it with `docker compose stop db` without deleting data. **Do not run `docker compose down -v` unless you intentionally want to delete the PostgreSQL volume.**

In the **backend** directory and the Fish shell where you will run Python:

```fish
cd backend
source .venv/bin/activate.fish
python -m pip install -r requirements-dev.txt
set -gx DATABASE_URL 'postgresql+psycopg://crimemap_dev:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/crimemap'
python -m scripts.db_status
```

Replace `YOUR_URL_ENCODED_PASSWORD` with the same password you set in the local `.env`. If it contains symbols such as `@`, `/`, `:`, `%` or `#`, URL-encode them before setting `DATABASE_URL`. Avoid pasting credentials into screenshots or shared terminal history.

For a **brand-new PostgreSQL database**, initialize the tables and first administrator **inside the same Fish shell**:

```fish
python -m app.bootstrap_admin
python -m scripts.seed_demo
python -m scripts.db_status
python -m uvicorn app.main:app --reload --port 8000
```

The first admin setup asks for your own username and password; it creates the necessary SQLAlchemy tables when the selected database has no accounts. PostgreSQL does not inherit the existing SQLite admin password or its incidents. New DBs are deliberately isolated.

In a second terminal, start Vite as before:

```fish
cd ~/Documents/Repos/CrimeMap-work/frontend
npm run dev
```

Open http://localhost:5173 and log in with the administrator you created **in PostgreSQL**.

### Return to SQLite

Stop the backend, clear `DATABASE_URL` in the Fish shell, and restart FastAPI:

```fish
set -e DATABASE_URL
python -m scripts.db_status
python -m uvicorn app.main:app --reload --port 8000
```

Your existing `backend/crimemap.db` is still there. You can also simply open a fresh terminal without the PostgreSQL-specific environment variable.

## Prevention planner table

Module 04 adds `prevention_plans`, a new table containing human-reviewed synthetic prevention action proposals, selected measure, fictional zone/category, a count-based evidence snapshot, coordinator, notes, due date, status and creation/update timestamps. It references the creator's local user ID. Existing incidents and authorization accounts are untouched.

When you start FastAPI with `python3 start.py`, the local prototype's SQLAlchemy initialization adds this missing table in the *currently selected database* (SQLite by default, PostgreSQL only if you explicitly configured `DATABASE_URL`). You do not need to wipe or re-import your 100 incidents.

Run `python -m scripts.db_status` from the `backend` directory to inspect incident, account, session and prevention-plan row counts. For an operational system, replace automatic schema creation with reviewed, versioned Alembic migrations.

## Data files and behavior

| Resource | Purpose |
|---|---|
| `backend/app/db.py` | SQLAlchemy engine configuration; SQLite default and PostgreSQL via `DATABASE_URL` |
| `backend/app/models.py` | Persisted incident records |
| `backend/app/auth_models.py` | User accounts and session metadata |
| `data/synthetic_incidents.csv` | Canonical **100-row** synthetic seed with stable `DEMO-` IDs |
| `frontend/public/sample-data/synthetic_incidents.csv` | 100-row downloadable example for manual imports (without stable IDs) |
| `backend/scripts/seed_demo.py` | Idempotent, non-destructive fixture top-up |
| `backend/scripts/db_status.py` | Read-only table-count and active database diagnostic |
| `compose.yaml` | Optional local-only PostgreSQL Docker service |
| `.env.example` | Copyable PostgreSQL configuration template, no secrets |

**Import behavior differs from seeding.** The frontend CSV import assigns new random incident IDs, so manually importing the example repeatedly creates duplicate-looking fictional reports. To upgrade a previously seeded database from 36 demo IDs to 100, run `python -m scripts.seed_demo` instead.

## Production considerations

`Base.metadata.create_all` is suitable for additive local prototypes but is **not** a schema migration framework. Before hosting the app, adopt Alembic migrations, secret management, secure TLS, database least-privilege roles, backups/restore drills, MFA and audit trails, plus a dedicated data-governance review. For true spatial operations, consider PostgreSQL with the **PostGIS extension** once there is a documented need and appropriate authorized data. Do not interpret synthetic geospatial density as verified real-world crime risk.
