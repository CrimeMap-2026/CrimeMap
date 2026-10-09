# Module 04 — Operational Overview (IPMCAP-inspired)

This module adds a **synthetic demonstration** of the operational layers publicly described on the Telangana Police IPMCAP website: https://ipmcap.tspolice.gov.in/ .

## Features implemented

- One Leaflet/OpenStreetMap operations overview with four independently toggled layers: existing CrimeMap incidents; fictional accident points; hypothetical CCTV asset markers; and three simulated patrol traces.
- Shared incident category and status filters, with spatial viewport fetching and API truncation warnings.
- Seven timestamped patrol history samples per example unit, selectable through a timeline slider. Tracks are fictional straight-line paths, not real GPS logs, road routes, or live updates.
- Click a crime marker to compare its great-circle distance to the nearest *demo* patrol at the chosen snapshot. This is neither a travel-time calculation nor dispatch guidance.
- Readable, responsive cards for viewport incident counts and fictional assets; accessible controls, safe DOM-text popups, error states and retry.

## New endpoint

`GET /api/operations/overview` returns a read-only JSON object containing `cameras`, `accidents`, `patrols`, `timeline`, `source_type: synthetic`, `simulation: true` and `live_tracking: false`.

No database migration, new dependency, external feed, credentials or changed records are needed. The sample datasets are immutable Python fixtures defined in `backend/app/operations.py`.

## Not yet implemented

- Secure officer accounts, role-based access, audit trails and mobile data-entry workflows.
- Real-time GPS tracking, device connectivity, historical actual patrol movement, unauthorized halts, geofencing or automatic alerts.
- Real CCTV streams, accident databases, emergency incident dispatch, route/ETA calculation and operational resource assignment.
- Verified predictive crime models.

Those capabilities require appropriate authorization, genuine datasets, access controls, methods, and dedicated infrastructure. Do not present this demonstration as a deployable operational police system.

## Start and test (Fedora / Fish)

```fish
cd ~/Documents/Repos/CrimeMap-work/backend
source .venv/bin/activate.fish
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m uvicorn app.main:app --reload --port 8000
```

In another terminal:

```fish
cd ~/Documents/Repos/CrimeMap-work/frontend
npm install
npm run build
npm run dev
```

Open http://127.0.0.1:5173 and choose **Operations** from the sidebar.

## Source and limits

Public website: https://ipmcap.tspolice.gov.in/

IPMCAP's publicly described offerings include patrol tracking, geofencing, accident/CCTV maps, geospatial analysis, and mobile field operations. This implementation is an independently written teaching prototype inspired by publicly documented workflows, not a clone of its authenticated interface, assets, code, backend, or official data.
