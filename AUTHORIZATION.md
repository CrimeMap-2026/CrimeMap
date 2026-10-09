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
