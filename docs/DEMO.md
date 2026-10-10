# CrimeMap — 5-minute hackathon demo

**Every incident, zone, map finding and prevention measure shown here is synthetic.** CrimeMap is a local prototype, not a verified Puducherry Police system.

## Before presenting

- Start from the repository root with `python3 start.py`. Open http://127.0.0.1:5173 and sign in as an existing **Officer or Administrator**.
- Verify the incident count matches **your current database** (100 seed records plus any manually imported or created records). Do not reseed or wipe the database.
- Confirm **Analytics** and **Prevention Planner** load. If possible, prepare a completed fictional prevention plan for review; otherwise create a simple proposal during the demonstration.
- Keep a previously downloaded report PDF as backup in case the server or browser stalls.
- Keep `http://127.0.0.1:8000/health` handy to check whether the API is running.

## Live walkthrough

| Time | Workspace | What to demonstrate |
| --- | --- | --- |
| **0:00–0:30** | **Incidents** | Explain that the same persistent fictional incident records power management, mapping and analysis. Show the registry filters and total. |
| **0:30–1:10** | **Add Incident** | Open the form, place and drag a marker; show automatically captured coordinates and **fictional zone suggestion**. Cancel rather than saving unless needed. |
| **1:10–2:00** | **Geospatial Intelligence** | Press **Map** on a registry row. Show the incident highlight, then **Grid Analysis → Compare periods** on the existing map. All grid patterns are descriptive, not predictions. |
| **2:00–2:50** | **Analytics** | Show category, status, time and zone counts. Explain that filtered aggregates use the complete database, not just the visible incident page. |
| **2:50–4:00** | **Prevention Planner** | Create or open a human-reviewed prevention action. Mark a demo plan completed if appropriate; open **Review observed counts** and choose two equal-length, ordered windows. Count changes do not prove prevention success. |
| **4:00–4:30** | **User Management** (Administrator only) | Show audit history and explain Viewer, Analyst, Officer and Admin permissions. Skip this step for Officer login. |
| **4:30–5:00** | **Analytics → Build presentation PDF** | Download one report combining incident analytics, fixed-grid findings and saved prevention plans. Close with **Record → Map → Analyse → Prevent → Review → Present**. |

For CSV import questions, show the read-only **Import incident data** preview, explain validation/possible duplicates and cancel. Avoid unnecessarily changing the demo dataset.

## Likely judge questions

**Is this crime prediction?** No. Heatmaps, spatial grids, period comparisons and planning outcomes are descriptive counts of fictional records. Actual prediction would require authorized datasets and independent validation.

**Are these real police zones or live CCTV/patrol feeds?** No. Zone suggestions use fictional reference points and the operations overlays are simulated. The basemap is OpenStreetMap.

**Are imported rows saved?** Yes. Confirmed imports are committed to the configured SQLite/PostgreSQL database, surviving refreshes and restarts. The CSV preview does not write records.

**How do you handle duplicates?** The system flags possible matches using category, UTC-second timestamp and rounded coordinates. These are indicators, not verified duplicate identities.

**Does finishing a preventive action prove it worked?** No. Completion is a recorded plan status. The earlier/later count review lacks a control group or causal attribution.

**Can this be deployed for real policing?** Not as-is. It needs authorized data and jurisdiction boundaries, security/privacy and governance reviews, production authentication and audit infrastructure, and robust operational validation.

## Manual readiness checklist

These checks are **not** covered by GitHub Actions and should be run before the hackathon:

- [ ] Desktop: all four workspaces load, incident-to-map navigation works, PDF downloads.
- [ ] Phone/tablet: horizontally scrollable navigation reaches every authorized workspace; the registry and modal work without losing controls.
- [ ] Keyboard: Tab reaches navigation and CSV chooser; Enter opens file picker; dialog focus stays inside, Escape closes when idle, and focus returns to the opener.
- [ ] Data: imported record count is unchanged after refreshing and restarting `python3 start.py`.
- [ ] Reliability: failed API requests show an error/retry rather than falsely claiming the database is empty.
- [ ] Presentation: synthetic-data warnings remain visible and you make **no claim** of real police intelligence, official zoning, predictive risk or proven prevention impact.

See [Developer setup and data safety](SETUP.md) for first-run instructions, roles, backups and local PostgreSQL.
