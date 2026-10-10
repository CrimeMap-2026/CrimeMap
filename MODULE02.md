# Module 02 — Geospatial Intelligence: Unified Crime and Operations Map

**Branch:** `dev/shwetha` in `aeroslayys/CrimeMap`. This is a single Leaflet workspace replacing duplicate Crime Map, Hotspots and Operations map pages.

> All bundled observations are **SYNTHETIC DEMONSTRATION DATA**. Maps, density, grid counts and rankings describe fictional test data, not validated crime hotspots, risk estimates or forecasts. The rectangular grid study extent is not an official Puducherry boundary. **Changes in synthetic counts are not validated emerging-crime hotspots, relative risk, or evidence of successful interventions.**

## Four visualization modes

1. **Markers** — color-coded incident pins with automatic clustering and HTML-escaped popups; a viewport-based recent incident list.
2. **Heatmap** — `leaflet.heat` visualization of synthetic incident point density (not a statistical risk model).
3. **Grid analysis** — server-calculated fixed-grid cell counts, approximate densities and ranks; date, zone, cell size and minimum-count controls; GeoJSON export. **Compare periods** within Grid Analysis measures the same cells across two equal-duration, non-overlapping IST periods; each cell is newly above threshold, persistently above threshold, or below threshold in the later period. The UI shares the map, category/status selectors, geometry, legend area, cell selection and GeoJSON export.
4. **Operations** — **on the same Leaflet canvas**, toggle fictional accident, CCTV, historical patrol-track and incident overlays. Use a simulated patrol-history timeline and inspect straight-line distances from selected synthetic incidents to demonstration patrol positions. These are neither dispatch suggestions nor live GPS data.

**Incident registry → map handoff:** Open **Incidents**, choose **Map** on any incident row, and CrimeMap switches to the existing Markers layer, zooms to the stored location and highlights it with a gold selection ring and the normal escaped popup. This also works for imported records and Viewer users. Filters that would hide the selected record are reset automatically. Press **Clear selection**, switch map modes, change map filters, or reset the map to dismiss the highlight. The target is still visible if the viewport marker query is clustered or truncated. This is client-side navigation, not a new map instance or a new backend endpoint.

Shared category and status filters apply to incident layers in Markers, Heatmap, Grid and Operations. Date/zone/cell settings only apply to Grid. Operations has its own fictional-asset layer toggles and timeline. No second map instance or standalone Operations tab exists.

Official Puducherry Police resource links are provided for references, not as live API integrations.

## API and data integrity

- `GET /api/map/incidents` — existing bounded GeoJSON viewport query; max 2,000 returned incidents and truncation flag.
- `GET /api/hotspots/grid` — existing filtered fixed-grid concentration aggregates and metadata; limits/parameters are unchanged.
- `GET /api/hotspots/compare` — role-protected descriptive two-period comparison with aligned cells, total and excluded incident counts, and category/status/zone filters; accepts four mandatory dates, matching calendar durations of at most 366 days.
- `GET /api/analytics/filters` — available demonstration zones for grid controls.
- `GET /api/operations/overview` — immutable synthetic patrol, CCTV and accident examples, including a static time sequence.

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

Open `http://localhost:5173/`. Navigate to **Map & spatial analysis**, verify all four modes, category/status filters, Grid Analysis → Single period and Compare periods, date validation, cell thresholds, cell selection, GeoJSON downloads, and mobile layout.

## Design and accessibility notes

- Uses one Leaflet instance; changing modes replaces only the data overlay.
- Larger interface text, darker-background contrast improvements, visible focus outlines, responsive map controls, simulator controls and historical timeline.
- Popup content is set using DOM `textContent` rather than injecting user-controlled HTML.
- OpenStreetMap tile attribution stays visible; public tiles require internet access and responsible use.

See [PUBLIC_POLICE_PORTAL_RESEARCH.md](PUBLIC_POLICE_PORTAL_RESEARCH.md) for research on official public police sites and documented features. Do not operationalize this prototype with real incident-level data without authorization, access controls, location/privacy safeguards and a validated analysis methodology.
