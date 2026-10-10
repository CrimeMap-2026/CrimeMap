# CrimeMap — Google Cloud deployment handoff

**For teammates: this is what we deployed and how it works.** Updated 11 October 2026. CrimeMap is a **synthetic-only hackathon prototype**, not a validated police platform. Do not upload real police, victim, witness or operational data.

If you just want to test the website, **you do not need to install Google Cloud SDK, run Docker, or initialize a database**. Ask the project administrator for a CrimeMap login with the appropriate role, then open the URL below (provided the service has been made browser-accessible).

## Deployment at a glance

| Resource | Value in the current demo |
| --- | --- |
| Website / HTTPS endpoint | https://crimemap-595311113823.asia-south1.run.app |
| Google Cloud project ID | `crimemap-511218` |
| Region | `asia-south1` (Mumbai, India) |
| Cloud Run **web service** | `crimemap` (initial revision `crimemap-00001-pt6`; newer deploys create new revisions) |
| Cloud Run **one-time initialization job** | `crimemap-init` (ran successfully; **do not rerun for routine deployments**) |
| Cloud SQL PostgreSQL instance | `crimemap-db` |
| Cloud SQL database / app DB user | `crimemap` / `crimemap_app` |
| Cloud SQL connection name | `crimemap-511218:asia-south1:crimemap-db` |
| Artifact Registry repository | `asia-south1-docker.pkg.dev/crimemap-511218/crimemap` |
| Initially deployed Docker image | `asia-south1-docker.pkg.dev/crimemap-511218/crimemap/crimemap:demo` |
| Runtime service account | `crimemap-runtime@crimemap-511218.iam.gserviceaccount.com` |
| Secret Manager references | `crimemap-db-password` and `crimemap-admin-password` (secret **names only**, never values) |
| GitHub source | https://github.com/aeroslayys/CrimeMap — branch `dev/shwetha` |

**Website access state can change.** It was *initially* deployed privately (Cloud Run IAM invoker check enabled). Later we may have enabled direct browser access for team testing. Do **not** assume that the URL is currently public or private; verify the Cloud Run Authentication setting in the Console. Even when publicly reachable, the app has its **own** login system. This is separate from Google Cloud IAM.

## Architecture in plain English

```text
Teammate / browser
    |
    | HTTPS (one website origin)
    v
Google Cloud Run: service "crimemap"
    |  One container built from Dockerfile
    |  - Built React/Vite frontend (static files, not a dev Vite server)
    |  - FastAPI + Uvicorn serving UI, /api/* and /health on port 8080
    |
    |  Cloud SQL connection + SQL user + Secret Manager DB password
    v
Cloud SQL PostgreSQL: "crimemap-db"
    |  Database "crimemap"
    |  - users: username, salted password hash, role and active status
    |  - login_sessions: revocable session-token hashes
    |  - incidents: synthetic records and manual imports
    |  - prevention_plans and audit_events
    v
Persistent records across browser refreshes / Cloud Run restarts / deployments

GitHub (dev/shwetha) --Cloud Build--> Artifact Registry (Docker image)
                                            |
                                            v
                                    Cloud Run revision

One-time Cloud Run Job "crimemap-init" --Cloud SQL--> initial admin + demo seed
```

### What gets saved where?

- **Adding a user in Admin → User Management:** the FastAPI backend inserts the account into Cloud SQL's `users` table. Passwords are stored as salted **hashes**, not plaintext. The account remains after a Cloud Run restart/redeployment.
- **Signing in:** the session hash is stored in `login_sessions`; the browser receives an HttpOnly, Secure, SameSite=Strict cookie over HTTPS.
- **Creating/importing an incident:** the `incidents` table is updated; prevention plans and audit information use their own tables.
- **Local clones are different:** `python3 start.py` / `start_windows.bat` normally use each teammate's local SQLite database. They do **not** connect to this cloud database unless specifically configured. Git pulls do not copy live data.
- **Map basemap:** the browser uses OpenStreetMap-backed tiles; they're not stored in PostgreSQL. All crime/operations overlays remain fictitious.
- **Cloud Run's container filesystem is not durable storage.** The cloud app explicitly requires PostgreSQL so it cannot accidentally start with a disposable SQLite file.

### Why a single container?

The root `Dockerfile` has two build stages: Node.js installs dependencies and compiles the React/Vite site; Python installs FastAPI dependencies and copies the built assets. Uvicorn listens on Cloud Run's `PORT` (configured as 8080). The backend mounts the built UI at `/`, so the browser calls `/api/...` on the *same* HTTPS origin. The local `start.py` still launches **two development servers** and is not used in the deployed container.

The web service was configured with **minimum instances 0**, **maximum instances 2**, **concurrency 20**, and **1 GiB memory**. Google manages HTTPS, request routing and scaling.

---

## How we deployed it (initial setup; do not repeat on the existing project)

**Use this only for fictional hackathon records.** The Cloud Run image builds the React frontend and serves it from FastAPI on one HTTPS hostname. The runtime requires Cloud SQL PostgreSQL; it fails on missing settings and cannot silently write to temporary SQLite. `start.py` remains the **local development launcher**, not the Cloud Run container command. The Cloud Run service creates no users or seed incidents at startup.

The following is a record of **how the existing resources were provisioned**, not a checklist to rerun on today's deployed project. Commands were run in **Google Cloud Shell (Bash)**, not Fedora/Fish or Windows PowerShell. Repeating `create` commands generally fails if resources exist; creating different ones can incur charges. Review trial expiration, usage and budget alerts. A budget alert is **not a spending cap**.

### 1. Cloud project and PostgreSQL

In [Google Cloud Console](https://console.cloud.google.com/), the project used for this demo is **`crimemap-511218`**, under the activated trial billing account. Open [Cloud Shell](https://console.cloud.google.com/?cloudshell=true):

```bash
export PROJECT_ID="crimemap-511218"
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
gcloud builds submit --region="$REGION" --tag "$IMAGE" .
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
  --set-cloudsql-instances="$CONNECTION" \
  --set-env-vars="CRIMEMAP_DEPLOYMENT=cloud-run,CLOUD_SQL_CONNECTION_NAME=$CONNECTION,DB_NAME=crimemap,DB_USER=crimemap_app" \
  --set-secrets="DB_PASS=crimemap-db-password:latest" \
  --min-instances=0 --max-instances=2 --concurrency=20 \
  --memory=1Gi --port=8080 \
  --invoker-iam-check
```

We answered **N** to the prompt asking whether to allow unauthenticated invocations. Cloud Run therefore started behind an **IAM invoker check** initially. Once the application and account setup are reviewed for **synthetic-only demo sharing**, you may explicitly allow anyone to reach the landing page:

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

## Day-to-day tasks for the team

The following commands are for **Google Cloud Shell (Bash)** and an authorized person with the right project permissions. Most teammates only need the website URL and their own app account.

### Check deployment, logs and seed-job status

```bash
gcloud config set project crimemap-511218
export REGION="asia-south1"

# Confirm the deployed HTTPS URL and revision/service configuration:
gcloud run services describe crimemap --region="$REGION"
gcloud run services describe crimemap --region="$REGION" --format='value(status.url)'

# Read recent application logs (no need to send credential values):
gcloud run services logs read crimemap --region="$REGION" --limit=50

# View history of the one-time initialization job (do not execute it):
gcloud run jobs executions list --job=crimemap-init --region="$REGION"
```

The health endpoint is `/health`. With public website access enabled, `curl https://crimemap-595311113823.asia-south1.run.app/health` should return `{"status":"ok"}`. If the Cloud Run IAM invoker check is enabled, an unauthenticated browser or `curl` request will instead receive 403. An authorized caller can test using an identity token **if it has Cloud Run Invoker permission**:

```bash
curl -i \\
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \\
  "https://crimemap-595311113823.asia-south1.run.app/health"
```

### Create accounts for testers

Sign in to the website as a CrimeMap **administrator** and use **Admin → User Management**. Create separate accounts with the least privilege needed (Viewer, Analyst or Officer); do not share the admin password. The app is *not* connected to Google identities for its user accounts. The seeded initial username was `demo-admin`; the password was entered privately and is not part of this repository.

You can inspect counts using **Cloud SQL → crimemap-db → Cloud SQL Studio**:

```sql
SELECT username, role, is_active FROM users ORDER BY username;
SELECT COUNT(*) AS synthetic_incident_count FROM incidents;
```

This does not expose password hashes or personal credentials. The app remains a **synthetic-only demo**.

### Update the deployed code without touching data

**Do not rerun the initializer to publish code changes.** In Cloud Shell, update the checkout (only if your working tree is clean), build a **new version-tagged image**, and deploy it as a new Cloud Run revision:

```bash
cd ~/CrimeMap
git status
git switch dev/shwetha
git pull --ff-only

export PROJECT_ID="crimemap-511218"
export REGION="asia-south1"
gcloud config set project "$PROJECT_ID"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/crimemap/crimemap:$(git rev-parse --short HEAD)"

gcloud builds submit --region="$REGION" --tag="$IMAGE" .
gcloud run deploy crimemap --image="$IMAGE" --region="$REGION"
```

On an existing service, this deploys a **new revision**; verify the existing Cloud SQL attachment, secrets, service account and desired authentication state afterward. It does **not** run `crimemap-init`. Data and user accounts stay in Cloud SQL. If the updated app needs database schema changes, plan and test a **backed-up migration** first: `Base.metadata.create_all()` only creates missing tables, **not** general schema migrations.

For recovery, Cloud Run allows traffic to be moved back to a previous revision in its **Revisions / Traffic** screen; check schema compatibility before rolling back.

### Website access: private versus shareable

The first deployment explicitly answered **N** to "Allow unauthenticated invocations", keeping Cloud Run IAM enabled. **Only after deciding to allow synthetic-demo browser access** should an administrator run:

```bash
# Make the landing page reachable by anyone with the URL:
gcloud run services update crimemap --region=asia-south1 --no-invoker-iam-check

# Require Google Cloud IAM authorization again:
gcloud run services update crimemap --region=asia-south1 --invoker-iam-check
```

These settings operate at the **Cloud Run edge**. CrimeMap login/roles operate **inside FastAPI**. Making the URL publicly reachable means attackers can access the login page and any unauthenticated endpoints, so keep only fictional records and use unique, strong passwords. This demonstration app has **not** undergone a production security audit. Prefer switching back to IAM protection after testing.

### Costs, trial limits and data safety

- Google Cloud's **$300 Free Trial credit** (for eligible trial accounts) is not the same as the **separate, time-limited Cloud SQL trial-instance promotion**. Check the actual Billing account type, remaining credits and trial-expiration dates in [Billing](https://console.cloud.google.com/billing).
- **Cloud Run** can scale down when idle because `min-instances=0`, but builds, storage, egress and other usage may still be metered. **Cloud SQL** is independent; after its trial period or upgrade, an instance may incur ongoing charges even when the site is idle. Don't assume budgets automatically cap or stop charges.
- Set up **Billing → Budgets & alerts**, and watch **Billing → Reports** filtered by project `crimemap-511218`. Verify whether the account is still a Free Trial or has been upgraded to paid.
- **Preserve the database**: no `DROP TABLE`, no deleting Cloud SQL, no resetting `backend/crimemap.db`, and no bulk reseeding to fix app issues. Plan a backup/export and database migration before any trial expiration; features and backups available to a promotional Cloud SQL instance can be limited. Local imported CSV records are **not** automatically mirrored to the cloud.
- Secret Manager stores the *password values*, not GitHub. Never echo secrets to the terminal, commit them, or paste them in issues. The **admin-password secret is only needed for initialization**, not for normal web app operation; remove the init job/unused admin-secret access after confirming success if no longer needed.

## Common problems

| Symptom | What it usually means | What to inspect |
| --- | --- | --- |
| `403 Forbidden` before seeing the login page | Cloud Run **IAM** may still require a Google identity | Cloud Run service → Security / Authentication and Invoker permissions |
| Login page loads but signing in fails | Wrong cloud credentials, inactive/locked account, or API/database error | Use the **cloud** account, not a local SQLite account; read Cloud Run logs |
| `500` on the API / login fails for everyone | Cloud SQL connection, missing secret permissions, expired trial or database outage | Cloud Run logs, SQL instance status, service account `roles/cloudsql.client`, DB secret |
| App returns `503` or won't start | Container startup, PORT, missing required `DB_*` settings or secret access | Cloud Run revision logs and container environment/secret references |
| An incident/user is missing after editing locally | Local SQLite and Cloud SQL are **different databases** | Confirm whether the action was performed on localhost or the HTTPS URL |
| Teammates cannot open maps | External basemap/tiles or browser/network access may be blocked | Browser dev tools/network, OpenStreetMap tile availability |
| Costs unexpectedly increase | SQL instance still provisioned, more traffic/builds/storage | Billing Reports + budgets; check whether trial credits apply |

## Relevant source files

- [`Dockerfile`](../Dockerfile) — production container
- [`.dockerignore`](../.dockerignore) — exclude local databases, virtualenvs and secrets from the build
- [`backend/app/main.py`](../backend/app/main.py) — API and built-React static mounting
- [`backend/app/db.py`](../backend/app/db.py) — Cloud SQL socket/password handling, safe failure when configuration is missing
- [`backend/app/auth.py`](../backend/app/auth.py) — HTTPS origin checks and secure session cookies
- [`backend/scripts/cloud_init.py`](../backend/scripts/cloud_init.py) — explicit one-time admin/seed step
- [`backend/scripts/seed_demo.py`](../backend/scripts/seed_demo.py) — insert only missing canonical synthetic fixtures
- [`.github/workflows/validate.yml`](../.github/workflows/validate.yml) — backend, frontend, PostgreSQL, Windows launcher, and production container CI checks
- [`SETUP.md`](SETUP.md) — local Windows/Linux development setup; [`DEMO.md`](DEMO.md) — demo checklist

Official references: [Deploying to Cloud Run](https://cloud.google.com/run/docs/deploying), [Connect Cloud Run to Cloud SQL](https://cloud.google.com/sql/docs/postgres/connect-run), [Secret Manager integration](https://cloud.google.com/run/docs/configuring/services/secrets), [Cloud Run authentication](https://cloud.google.com/run/docs/authenticating/public).
