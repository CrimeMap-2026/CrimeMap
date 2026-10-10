# Module 03 — Crime Analytics Dashboard

**SYNTHETIC DEMONSTRATION DATA.** Every card, chart, and table describes fictional development records. These are not verified Puducherry crime statistics, official police boundaries, forecasts, or operational intelligence.

## Integration

Analytics is a third view inside the existing React application and sidebar. It reuses the shared header, panels, typography, buttons, and dark theme. Recharts is loaded with the analytics view so its chart code is not needed for the initial incident screen. The existing incident and map views remain available.

The new FastAPI router uses the existing SQLAlchemy model and session dependency. It performs one SQL statement with a shared filtered CTE and five `GROUP BY` queries combined with `UNION ALL`. Only aggregate buckets are returned from the database; no paginated incident list is used. All five charts therefore share one statement's database snapshot. There are no migrations or writes to incident data.

## Endpoints

`GET /api/analytics/overview`

| Parameter | Meaning |
| --- | --- |
| `start_date` | Optional `YYYY-MM-DD`, inclusive start of the Asia/Kolkata calendar day |
| `end_date` | Optional `YYYY-MM-DD`, inclusive end of the Asia/Kolkata calendar day |
| `category` | Optional existing category enum value |
| `status` | Optional `reported`, `under_investigation`, or `closed` |
| `zone` | Optional exact named demonstration zone, with surrounding whitespace trimmed |
| `unspecified_zone` | Optional boolean; select records with null/blank zones |

Omitted dates mean all time on that side. Reversed/invalid dates, invalid enum values, and simultaneous `zone` plus `unspecified_zone=true` return HTTP 422. A valid filter with no matches returns HTTP 200 with zero totals and empty category/date/zone lists; status and hour lists retain zero buckets.

Example:

```text
/api/analytics/overview?start_date=2026-09-01&end_date=2026-09-30&category=Theft&status=reported
```

Stable response fields:

- `source_type: "synthetic"`, `data_label: "SYNTHETIC DEMONSTRATION DATA"`, `timezone: "Asia/Kolkata"`.
- `summary`: `total_incidents`, `category_count`, `most_frequent_category`, `most_frequent_count`, `top_categories`, `zone_count`, `unspecified_zone_count`.
- `by_category`, `by_status`, `by_date`, `by_hour`, `by_zone`: arrays of `{ "key": ..., "count": ... }`.
- `trend_interval`: `day`, `month`, or `year`, explaining the date bucket keys.

Every chart's counts sum to `summary.total_incidents`. Category count includes only categories present in the filtered data. Ties are returned in `top_categories` alphabetically and displayed explicitly; `most_frequent_category` is the first tied category. In an empty result it is null.

Named zones use the existing `police_station` field. Null and blank values share a null `by_zone.key`, displayed as **Unspecified zone**. This bucket contributes to incident totals but not the distinct named `zone_count`. A literal named zone is never confused with the null filter option.

Dates and hours refer to occurrence time. Stored UTC timestamps remain unchanged. SQLite uses an explicit UTC+05:30 conversion for the modern Puducherry demo dataset; PostgreSQL uses `Asia/Kolkata`. The hour list always contains `00` through `23`. Trend gaps are filled with zeros, including requested date boundaries when matches exist. Ranges of up to 366 days use daily buckets; longer ranges use months, switching to years above 366 months. No rolling default date window silently excludes older demonstration records.

`GET /api/analytics/filters`

Returns `categories`, `statuses`, sorted distinct named `zones`, `has_unspecified_zone`, and the synthetic labels. Options cover the whole synthetic dataset so users can change a filter even after a zero-result selection. Both endpoints explicitly exclude any non-synthetic records.

## Consolidated PDF presentation export

From the **existing Analytics page**, open **Build presentation PDF** beneath the filters. Choose which portions to include: **Incident analytics** (summary, vector bar charts and trend), **Fixed-grid geographic findings** (top-count cells and a schematic relative-position graphic) and **Saved prevention plans** (human-reviewed plan summaries). The PDF is generated on demand by ReportLab and downloaded as `crimemap-synthetic-presentation.pdf`.

`GET /api/reports/presentation` is authorized at **Analyst or higher** and accepts the same optional filters as `/api/analytics/overview`, plus comma-separated `sections=analytics,spatial,prevention`, `cell_size_m` (250 to 5000) and `min_count` (2 to 1000). Report sections use the existing Analytics and Geospatial Intelligence aggregate implementations directly; there is no new map, duplicate aggregation code or separate Reports page. Grid counts are computed for the same category/status/date/zone filters as analytics.

The saved-plan summary shows up to 12 latest plans matching a selected category/zone, as well as the full matching plan count. **The incident dates and status filter do not apply to saved plans**, which are lifecycle records rather than incident observations. Charts and relative cell positions are original vector graphics, not downloaded OpenStreetMap tiles. An outline of reporting limitations is included in the PDF. It deliberately omits individual incident coordinates, descriptions, coordinators and progress notes.

For the new export, **install ReportLab into your existing backend venv** after pulling: `cd backend && .venv/bin/python -m pip install -r requirements.txt`. Never delete or recreate the SQLite database to install this feature. The route is read-only, streams a fresh PDF and leaves the database untouched.

## Start on Fedora with Fish

Backend terminal (reuse the existing virtual environment and database):

```fish
cd ~/Documents/Repos/CrimeMap-work/backend
source .venv/bin/activate.fish
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000
```

Frontend terminal:

```fish
cd ~/Documents/Repos/CrimeMap-work/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`, then select **Analytics**. API documentation: `http://127.0.0.1:8000/docs`. Do not reseed or replace your database to install this module.

## Validation

```fish
cd ~/Documents/Repos/CrimeMap-work/backend
source .venv/bin/activate.fish
python -m pytest -q
cd ../frontend
npm run build
```

The backend suite covers the existing incident CRUD/import and GeoJSON map behavior plus analytics totals, ties, every filter, combined filters, invalid input, empty datasets, missing zones, local midnight boundaries, half-hour UTC offsets, zero-filled time buckets, updates/deletes, source classification, and totals beyond registry pagination limits. Test application startup and requests both use an isolated in-memory database.

Validation during implementation: **40 tests passed** and the production build succeeded. The installed Starlette version emits a deprecation warning about its httpx-based test client; it does not fail tests. PostgreSQL-specific time bucketing has not been exercised against a running PostgreSQL instance; the suite uses the project's default SQLite database.

A headless Chromium smoke check also passed against a temporary copy of the existing 36-record database: all five charts rendered; totals matched the API; category/status/zone filters, date validation, loading, empty results, and error/retry states worked. Checks at 768, 390, and 320 pixels found no horizontal page overflow. Navigation back to the map, marker/heatmap switching, and opening the incident form also passed with no browser JavaScript errors. Playwright and Chromium were installed only under `/tmp` for this check, not as project dependencies. The original database checksum was unchanged.

Recharts `^3.10.1` is the only added direct application dependency. Its [official chart API](https://recharts.github.io/en-US/api/BarChart/) documents the responsive chart and accessibility interfaces used here. No new backend dependency is required.
