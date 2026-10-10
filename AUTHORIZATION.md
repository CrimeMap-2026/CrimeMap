# CrimeMap Authorization Levels

**Scope:** Development prototype using synthetic records only. All API permissions are enforced in FastAPI, **not** by hiding React buttons. No identity integration with Puducherry Police or CCTNS exists.

## Roles and permissions

| Capability | Viewer | Analyst | Officer | Administrator |
|---|:---:|:---:|:---:|:---:|
| Sign in and view synthetic incident records | ✅ | ✅ | ✅ | ✅ |
| View markers/heatmap and demo operations overlays | ✅ | ✅ | ✅ | ✅ |
| View analytics, filters, and grid analysis | — | ✅ | ✅ | ✅ |
| Create/import synthetic incident records | — | — | ✅ | ✅ |
| Update synthetic incident status or description | — | — | ✅ | ✅ |
| Delete incident records | — | — | — | ✅ |
| Create/disable accounts, change roles, reset passwords | — | — | — | ✅ |

No public sign-up is provided. Existing session tokens are revoked after role change, account disable, password change or password reset. The Administrator cannot demote or disable their own account.

## First-time setup (from `backend/`)

Make sure the backend environment and dependencies are installed, then run:

```fish
cd ~/Documents/Repos/CrimeMap-work/backend
source .venv/bin/activate.fish
python -m app.bootstrap_admin
```

Enter your own administrator username and a unique password of 12–128 characters **when prompted**. Password entry is hidden; no default admin password is supplied or committed.

This creates the first administrator **only when no user accounts exist in the selected database**. Run it *before* starting the server. The database defaults to `backend/crimemap.db` (or `DATABASE_URL` if configured).

Start FastAPI and Vite as normal:

```fish
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```fish
cd ~/Documents/Repos/CrimeMap-work/frontend
npm install
npm run dev
```

Visit http://127.0.0.1:5173 . Log in as the administrator and open **User management** to create accounts for the other three roles. Share temporary passwords privately; users should change them using the **Password** control in the top navigation.

**Important:** Existing developer databases with synthetic incidents are preserved. Adding the user and session tables does not replace or reseed incidents. No migration framework is bundled; `create_all` adds missing authentication tables for this prototype.

## Local Vite login origins and proxy setup

The frontend normally runs on `http://localhost:5173` or `http://127.0.0.1:5173`, while Vite forwards `/api` requests to FastAPI at `http://127.0.0.1:8000`. FastAPI may receive a forwarded `Host` header for port 8000, while the browser correctly sends the original page's `Origin` (port 5173). **Those two ports are intentionally different**.

CrimeMap explicitly accepts those two exact local Vite origins **only when the backend's Host is also loopback**. Arbitrary cross-origin requests continue to receive HTTP 403. Same-origin browser requests are also accepted.

For a non-local deployment behind a trusted reverse proxy, set `CRIMEMAP_TRUSTED_ORIGINS` to the exact HTTPS browser origins (comma-separated), for example `https://crimemap.example.org`. Never use a wildcard or permit untrusted domains. This configuration is not a substitute for HTTPS, host validation, correct proxy headers, CSRF protections, or the other production controls listed below.

If your browser still reports “Cross-origin changes are not allowed” after updating the code, restart FastAPI and make sure you're opening the Vite frontend on one of the two documented local URLs. If Vite uses a different port, explicitly set the permitted origin in `CRIMEMAP_TRUSTED_ORIGINS` for development.

## Administrator change history (synthetic incidents and plans)

CrimeMap records **successful** incident creation, status/description updates, deletion and CSV/JSON imports, as well as prevention-plan creation and changes. Each event has a UTC timestamp, actor ID, username and role snapshot, event type, record ID when applicable, and a limited set of non-sensitive change indicators. Import batches produce one event recording the batch size.

Audit entries are inserted **in the same SQL transaction** as the operation they describe. Failed or rolled-back changes produce no successful event; no-op edits are not logged. Passwords, session tokens, incident descriptions, prevention notes and coordinator names are **never copied into event details**.

Only Administrators can read the paginated `GET /api/admin/audit` endpoint (optional `entity_type`, `actor_id`, `limit` and `offset` filters). The interface displays the history **inside the existing User Management page**, not in a separate navigation module. Other roles receive HTTP 403. This change history is a **local, application-level log**, not a tamper-resistant security audit trail. Existing incidents, plan revisions and account actions performed before the feature existed cannot be reconstructed, and user account changes/login attempts are not yet included. Direct database administrators could alter event records. Formal immutable logging, retention, full actor/session analysis, MFA and trusted timekeeping would be required before operational use.

## Backend enforcement

- `POST /api/auth/login` — validates password and issues an **HttpOnly**, `SameSite=Strict` session cookie with an eight-hour maximum lifetime.
- `GET /api/auth/me` — fetches the current authenticated profile; no password is returned.
- `POST /api/auth/logout` — invalidates the session on the server.
- `POST /api/auth/change-password` — changes own password, revoking all sessions.
- `GET /api/admin/users` — Administrator only.
- `POST /api/admin/users` — Administrator only; assigns one of the four roles.
- `PATCH /api/admin/users/{id}` — Administrator only; change role or disable/enable.
- `PUT /api/admin/users/{id}/password` — Administrator only; reset account password.
- All `/api/incidents` reads and `/api/map/incidents` reads require Viewer-or-higher. `/api/analytics/*` and `/api/hotspots/*` require Analyst-or-higher.
- Incident create/import/patch require Officer-or-higher. Incident deletion and user-management routes require Administrator.
- The fictional `/api/operations/overview` requires an authenticated Viewer-or-higher.
- `GET /health` remains unauthenticated for developer service checks.
- Missing/expired/revoked credentials return HTTP **401**; insufficient role returns **403**.

The session cookie contains an opaque random token, while the database stores only its SHA-256 digest. Passwords are individually salted and hashed using the standard-library `scrypt` password-hardening function. The login handler temporarily locks an account after repeated invalid passwords. API mutations reject mismatched browser Origin headers as defense in depth, and API responses include `Cache-Control: no-store`.

## Limitations and security requirements

**Do not expose this prototype over the public internet or use it with real police, victim, CCTV or operational records.** Password authentication and RBAC are only one part of production security. In particular:

- Local HTTP is permitted solely for development. Cookie `Secure` is enabled when the app is served under HTTPS; a real deployment must enforce TLS and trusted reverse-proxy settings.
- Implement external identity/SSO and MFA for actual officers; account recovery, security audit logs, session controls, monitoring, rate limiting at the ingress, backups, robust database migrations, least-privilege infrastructure, and regular security testing.
- The basic database-backed account lockout is not a distributed abuse-prevention service and may itself be abused for denial of access. Do not interpret it as full brute-force protection.
- Test and review all new API endpoints for permissions. React visibility is only UX — FastAPI denies unauthorized operations.
- Browser assets and local example CSV files remain static public resources; **never include confidential data there**.
- All incident, patrol, accident, grid, statistics and CCTV examples remain fabricated demonstration records.

Run `python -m pytest -q` from `backend/` to verify authorization and application regression tests. GitHub Actions also performs tests and a frontend production build on the development branch.
