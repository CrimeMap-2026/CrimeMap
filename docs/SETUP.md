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

## Windows teammates (PowerShell)

Clone the default development branch with `git clone --branch dev/shwetha https://github.com/aeroslayys/CrimeMap.git`. Install Python 3.11+ and current Node.js LTS, then open **PowerShell** in the cloned repository:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m app.bootstrap_admin
.\.venv\Scripts\python.exe -m scripts.seed_demo
cd ..\frontend
npm install
cd ..
.\start_windows.bat
```

**Bootstrap and seed are first-time steps for a brand-new teammate database only.** The seeded incidents are fictional; existing users and records must not be overwritten or recreated. Each teammate has an independent SQLite database in their own `backend\crimemap.db`. Source cloning never copies another developer's private database or accounts.

After setup, double-click `start_windows.bat` from Explorer, or run it from PowerShell. One terminal runs both FastAPI on port 8000 and Vite on port 5173. Ctrl+C stops them. The batch file checks for an installed venv and invokes the shared cross-platform `start.py`; it **does not seed, install, bootstrap, reset or delete anything**. Python virtualenvs must be created separately on each operating system.

Do **not** set PowerShell's execution policy to unrestricted: the provided launcher is a regular `.bat` file and does not need `.ps1` permission changes. If `py` is not installed but `python` is available, use `python -m venv .venv` instead. If `npm` is not recognized, reopen PowerShell after installing Node.js.

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

## Google Cloud Run + Cloud SQL deployment (synthetic demo only)

**Use this only for fictional hackathon records.** The Cloud Run image builds the React frontend and serves it from FastAPI on one HTTPS hostname. The runtime requires Cloud SQL PostgreSQL; it fails on missing settings and cannot silently write to temporary SQLite. `start.py` remains the **local development launcher**, not the Cloud Run container command. The Cloud Run service creates no users or seed incidents at startup.

The steps below use **Google Cloud Shell (Bash)**, not Fedora/Fish or Windows PowerShell. They **create billable resources**; review the current Cloud SQL instance estimate and set a budget alert before continuing. Cloud SQL runs and charges while provisioned, even if Cloud Run scales to zero. A budget alert is **not a spending cap**.

### 1. Project and managed PostgreSQL

In [Google Cloud Console](https://console.cloud.google.com/), choose a project with your activated trial billing account. Open [Cloud Shell](https://console.cloud.google.com/?cloudshell=true):

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="asia-south1"
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com
```

In **Cloud SQL → Create instance → PostgreSQL**:

- Select the **same Mumbai (`asia-south1`) region**, **Enterprise edition**, a small single-zone/shared-core development configuration (check what the console actually offers and its hourly/monthly estimate), and an instance ID such as `crimemap-db`. Avoid Enterprise Plus and high-availability replicas for a short-lived demo.
- Create database `crimemap` and a dedicated SQL user `crimemap_app` with a long random password. Save the password privately. The managed **Cloud SQL connector** handles Cloud Run ↔ Cloud SQL traffic; do not add public authorized networks for the application.
- In Cloud Shell, retrieve the connection name (substitute your actual instance ID):

```bash
export INSTANCE_ID="crimemap-db"
export CONNECTION="$(gcloud sql instances describe "$INSTANCE_ID" --format='value(connectionName)')"
echo "$CONNECTION"
```

Cloud SQL is a **separate database**. It does not copy your local `backend/crimemap.db`, local admin account or extra CSV imports. Do **not** delete or modify that local file.

### 2. Separate secrets and minimal runtime identity

Use Secret Manager so SQL passwords are never placed in GitHub, Dockerfiles or plain deployment command arguments. In Cloud Shell, create these **two different** secrets. The admin secret is for the **one-time initialization job only**:

```bash
read -rsp "Cloud SQL crimemap_app password: " DB_PASSWORD; echo
printf '%s' "$DB_PASSWORD" | gcloud secrets create crimemap-db-password --data-file=-
unset DB_PASSWORD

read -rsp "New cloud admin password (12-128 chars): " ADMIN_PASSWORD; echo
printf '%s' "$ADMIN_PASSWORD" | gcloud secrets create crimemap-admin-password --data-file=-
unset ADMIN_PASSWORD

gcloud iam service-accounts create crimemap-runtime \
  --display-name="CrimeMap demonstration runtime"
export SERVICE_ACCOUNT="crimemap-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" --role="roles/cloudsql.client"
for NAME in crimemap-db-password crimemap-admin-password; do
  gcloud secrets add-iam-policy-binding "$NAME" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
done
```

If the Cloud Shell console already contains one of those resources from a prior attempt, **do not overwrite an existing secret/account** blindly; inspect and reuse the intended identity or create a fresh unique name.

### 3. Build once, initialize a fresh database explicitly

In Cloud Shell, clone the repo's tested branch:

```bash
git clone --branch dev/shwetha https://github.com/aeroslayys/CrimeMap.git
cd CrimeMap

gcloud artifacts repositories create crimemap \
  --repository-format=docker --location="$REGION" \
  --description="CrimeMap demonstration images"

export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/crimemap/crimemap:demo"
gcloud builds submit --tag "$IMAGE" .
```

The root `Dockerfile` compiles React, installs the backend, includes only synthetic fixture files, and launches Uvicorn on Cloud Run's `PORT`. The `.dockerignore` excludes `.env`, SQLite files, virtual environments, local dependencies, and secrets.

**For a new empty Cloud SQL database only**, run an explicit one-time initializer job. It creates the first cloud administrator **only if no users exist**, and `--seed` adds only missing canonical `DEMO-` fixture IDs. Neither action is performed on every web-server start.

```bash
gcloud run jobs create crimemap-init \
  --image="$IMAGE" --region="$REGION" --service-account="$SERVICE_ACCOUNT" \
  --set-cloudsql-instances="$CONNECTION" \
  --set-env-vars="CLOUD_SQL_CONNECTION_NAME=$CONNECTION,DB_NAME=crimemap,DB_USER=crimemap_app,CRIMEMAP_INITIAL_ADMIN_USERNAME=demo-admin" \
  --set-secrets="DB_PASS=crimemap-db-password:latest,CRIMEMAP_INITIAL_ADMIN_PASSWORD=crimemap-admin-password:latest" \
  --command=python --args=-m,scripts.cloud_init,--seed \
  --max-retries=0

gcloud run jobs execute crimemap-init --region="$REGION" --wait
```

Check the job completed successfully in the Cloud Run console before deploying the web service. If the job fails, inspect its logs; **do not reset the Cloud SQL database**. After confirming cloud admin login, delete this one-time job and remove the unused admin-password secret/permissions if you no longer need them.

### 4. Deploy the web service privately at first

```bash
gcloud run deploy crimemap \
  --image="$IMAGE" --region="$REGION" \
  --service-account="$SERVICE_ACCOUNT" \
  --add-cloudsql-instances="$CONNECTION" \
  --set-env-vars="CLOUD_SQL_CONNECTION_NAME=$CONNECTION,DB_NAME=crimemap,DB_USER=crimemap_app" \
  --set-secrets="DB_PASS=crimemap-db-password:latest" \
  --min-instances=0 --max-instances=2 --concurrency=20 \
  --memory=1Gi --port=8080 \
  --invoker-iam-check
```

Cloud Run starts behind an **IAM invoker check** initially. Once the application and account setup are reviewed for **synthetic-only demo sharing**, you may explicitly allow anyone to reach the landing page:

```bash
gcloud run services update crimemap --region="$REGION" --no-invoker-iam-check
gcloud run services describe crimemap --region="$REGION" \
  --format='value(status.url)'
```

**Warning:** Disabling Cloud Run IAM makes the URL publicly accessible on the internet, even though CrimeMap still requires its own username/password for incident and analytics APIs. This project's authentication, audit, data governance and rate-limiting are **development-grade**, not independently security-reviewed for public/real police data. Use strong unique demo passwords, limit who receives admin access, and make the service private again after team testing:

```bash
gcloud run services update crimemap --region="$REGION" --invoker-iam-check
```

The service uses **Secure, HttpOnly, SameSite=Strict session cookies** and HTTPS-only matching-host request origins in Cloud Run mode. Build settings are intentionally separate from localhost Vite configuration, so no external CORS origin is required.

### 5. Test persistence and control costs

On the Cloud Run HTTPS URL:

1. Sign in with the **new cloud admin credentials**; confirm the seeded fictional 100 incidents appear. Your original local account and any additional local CSV imports remain **local**.
2. Import a few distinct **fictional** CSV records. Refresh and sign out/in; verify they persist.
3. Export a presentation PDF, check geospatial maps, analytics and prevention plans.
4. Redeploy or allow Cloud Run to scale down, then return and confirm the imported records still exist in **Cloud SQL**.
5. Create separate least-privilege Viewer/Analyst/Officer test accounts in **User management** and avoid giving teammates the cloud admin password.

Configure a billing **budget alert** for the trial project. Delete or stop unnecessary Cloud SQL resources and switch the web service back to IAM-protected when the testing period ends; otherwise Cloud SQL continues billing. A trial balance is not a guarantee that arbitrary usage is free.

Useful official references: [Cloud Run containers](https://docs.cloud.google.com/run/docs/configuring/services/containers), [Cloud SQL connection](https://docs.cloud.google.com/sql/docs/postgres/connect-run), [Secret Manager integration](https://docs.cloud.google.com/run/docs/configuring/services/secrets), and [public vs private Cloud Run](https://docs.cloud.google.com/run/docs/authenticating/public).

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
