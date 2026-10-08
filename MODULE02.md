# Module 02 — Unified Crime Map & Spatial Analysis

**Branch:** `dev/shwetha` in `aeroslayys/CrimeMap`. This is a single Leaflet workspace, not separate Crime Map and Hotspots pages.

> All bundled observations are **SYNTHETIC DEMONSTRATION DATA**. Maps, density, grid counts and rankings describe fictional test data, not validated crime hotspots, risk estimates or forecasts. The rectangular grid study extent is not an official Puducherry boundary.

## Three visualization modes

1. **Markers** — color-coded incident markers and automatic clustering, with safe text-only popups. Visible incidents are fetched by the current viewport, sorted newest first in the sidebar.
2. **Density heatmap** — browser-rendered `leaflet.heat` visualization of the same viewport incidents. This is an illustrative point-density display, not statistical hotspot analysis.
3. **Grid analysis** — backend-calculated concentration cells rendered as GeoJSON polygons on **the same Leaflet map**. Features include ranked cell counts, approximate density per nominal square kilometer, a defined study extent, minimum-count threshold, date/zone filters, cell-size selection, focus/fit controls, and GeoJSON export.

The shared category and status filters apply to all modes. Date and demonstration-zone filters apply **only** to grid analysis because the existing viewport API does not support them. The grid is calculated across all matching records in a fixed study extent, independent of current viewport. All derived results remain read-only.

## API and data integrity

- `GET /api/map/incidents` — existing bounded GeoJSON viewport query; max 2,000 returned incidents and truncation flag.
- `GET /api/hotspots/grid` — existing filtered fixed-grid concentration aggregates and metadata; limits/parameters are unchanged.
- `GET /api/analytics/filters` — available demonstration zones for grid controls.

No database changes, migrations, or reseeding are required. The backend retains the original `/api/hotspots/grid` endpoint because grid analysis is a distinct aggregation algorithm, even though its UI now appears within the Crime Map.

## Test locally (Fedora, Fish)

```fish
cd ~/Documents/Repos/CrimeMap-work/backend
source .venv/bin/activate.fish
python -m pytest -q
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```fish
cd ~/Documents/Repos/CrimeMap-work/frontend
npm install
npm run build
npm run dev
```

Open `http://localhost:5173/`. Navigate to **Map & spatial analysis**, verify all three modes, category/status filters, grid thresholds, cell selection, fit, downloads, and mobile layout.

## Design and accessibility notes

- Uses one Leaflet instance; changing modes replaces only the data overlay.
- Larger interface text, darker-background contrast improvements, visible focus outlines, responsive map controls.
- Popup content is set using DOM `textContent` rather than injecting user-controlled HTML.
- OpenStreetMap tile attribution stays visible; public tiles require internet access and responsible use.

Do not operationalize this prototype with real incident-level data without authorization, access controls, location/privacy safeguards and a validated analysis methodology.
