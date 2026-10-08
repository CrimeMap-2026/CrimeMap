# Module 02 — Interactive Crime Map

This is an **incremental update** to the existing CrimeMap Module 01 project. Module 01 remains available through the sidebar.

## Features

- Leaflet map centered on Puducherry with OpenStreetMap basemap attribution.
- Color-coded crime markers with clustered grouping; click markers for safe HTML-escaped popups.
- Marker / heatmap toggle. The heatmap shows **synthetic point density**, not real crime hotspots or predictions.
- Crime category and case status filters; automatically reloads reports when the viewport changes.
- Side panel showing the latest eight visible incidents, with Locate buttons.
- `/api/map/incidents` bounded GeoJSON API: latitude and longitude bounds, category/status filters, and a maximum of 2000 returned features; warns when truncated.
- Four API tests for query/filter/validation and GeoJSON behavior.

## Apply the module update

Back up or commit any local changes before extracting. The ZIP contains only files added or modified by this module.

From your local Git repository root on Fedora/Fish:

```fish
cd ~/Documents/Repos/CrimeMap-work
git switch dev/shwetha
# Extract the update ZIP into this directory, preserving the backend/ and frontend/ paths.
cd frontend
npm install
npm run dev
```

The backend process must also be running with `python -m uvicorn app.main:app --reload --port 8000` from `backend/` after activating `source .venv/bin/activate.fish`. No database migration is needed.

Run API tests:

```fish
cd ~/Documents/Repos/CrimeMap-work/backend
source .venv/bin/activate.fish
python -m pytest -q
```

Then navigate in the app: **Crime map** in the sidebar.

### New API endpoint

`GET /api/map/incidents?south=11.9&west=79.8&north=12.0&east=79.9&limit=2000`

Optional query arguments: `category` and `status`. The response is a `FeatureCollection` with GeoJSON Point features and a top-level `meta` containing `total`, `returned`, `truncated`, and `source_type: synthetic`.

> All shipped observations are fictional. If this app ever uses real incident-level coordinates, restrict access to authorized police users and assess re-identification and sensitive location risks. This prototype has no auth and is not suitable for live policing.

### Limitations

- Map basemap tiles require internet access.
- Browser cluster/heatmap rendering is intended for demonstration-sized datasets, not millions of points.
- Zoomed-out or dateline-crossing viewports are outside this Puducherry-focused MVP's supported bounds query.
- Frontend production build depends on the new `leaflet`, `leaflet.markercluster`, and `leaflet.heat` packages being installed with npm.
