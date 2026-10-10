# CrimeMap — 5-minute Puducherry Police Hackathon demonstration

> **SYNTHETIC FICTIONAL DATA ONLY.** All incidents, zones, time patterns, operational overlays and planning examples in this prototype are invented. Nothing here is police intelligence, a scientifically validated hotspot, a forecast or evidence of prevention effectiveness.

## Presenter setup (before the judges arrive)

- Update `dev/shwetha`, install backend requirements (including ReportLab), and start with `python3 start.py` from the repository root. Open `http://127.0.0.1:5173`; keep a second browser tab on `http://127.0.0.1:8000/health`.
- Sign in with an **existing Officer or Administrator** account (Administrator if you want to show Change history). You do **not** need to recreate accounts or run the seed script. Confirm the incident count reflects your current database (e.g. original 100 plus any newly imported synthetic records), rather than promising a fixed total.
- In **Prevention Planner**, have at least one appropriate synthetic incident observation available so you can create a demonstration proposal. If a completed plan already exists, prefer reviewing that to save time.
- Use browser zoom around 100% and a readable desktop display. Have one of the existing sample CSVs available if import preview is requested. Keep the sample data file as a backup, but don't reimport it for the sake of a larger count.
- Optional offline fallback: generate and save the PDF from **Analytics → Build presentation PDF** before the presentation. It is a snapshot, not a live report.
- Never bring private/police data into the prototype. Don't claim fictional zone assignments are official police-station boundaries.

## Five-minute live workflow

| Time | On screen | What to explain / demonstrate |
| --- | --- | --- |
| 0:00–0:30 | **Incidents** | “CrimeMap connects incident recording to descriptive mapping, analysis and documented prevention. This demonstration uses fictional records.” Show persistent registry count and filter controls. |
| 0:30–1:15 | **Incidents → Add incident** | Open the existing incident form. Click the map, **drag the pin**, and show latitude/longitude and the nearby *fictional* zone suggestion updating. Close without saving unless you intend to create another test record. |
| 1:15–2:10 | **Incidents → Map** | Choose any row’s **Map** button. Geospatial Intelligence opens on its exact incident coordinates with a gold highlight. Switch to **Grid Analysis → Compare periods**. Explain aligned cells and equal-duration filters; changed counts are descriptive only. |
| 2:10–2:55 | **Analytics** | Show the category counts, IST time trends and status distribution. Change a filter briefly. The figures come from *all matching stored incidents*, including permitted CSV imports, not only the currently paginated registry page. |
| 2:55–4:10 | **Prevention Planner** | Use a current observation to create an advisory human-reviewed preventive action with a coordinator. Move a demonstration plan through **Proposed → In progress → Completed** if appropriate, then select **Review observed counts** for a completed plan. Choose earlier/later windows of equal length (e.g. Sep 1–10 and Oct 1–10, 2026). State clearly: “This compares synthetic counts; it does not prove that an activity caused the change.” |
| 4:10–4:40 | **User Management (Admin only)** | Show **Change history** entries for the test incident or action-plan changes. Explain role-based permissions: Viewer reads, Analyst analyses, Officer writes and Administrator manages users/deletions. Skip this step when demonstrating as Officer. |
| 4:40–5:00 | **Analytics → Build presentation PDF** | Choose Incident analytics + Fixed-grid findings + Saved prevention plans, then download one consolidated PDF. Close with: “Record → Map → Analyse → Prevent → Review → Present.” |

Keep a copy of the generated PDF in case a live window takes longer than expected. If importing a file during the demonstration, use the **read-only preview**, show the possible-duplicate classification, and cancel. Avoid altering the demonstration database unnecessarily.

## Useful short answers to likely judge questions

**Does it predict crimes?** No validated forecast is implemented. Temporal grid comparisons show where synthetic counts meet a descriptive threshold in one or both equal-duration periods. A real forecasting claim would need authorized historical records, out-of-sample testing, and bias/fairness review.

**How are the zones determined?** In the Add Incident picker, a nearby demonstration-zone label is suggested using **fictional reference points**, not official station polygons. The zone remains editable.

**Do imported records persist?** Yes. Successful uploads are committed to the configured SQLite/PostgreSQL database; browser refresh and server restart do not erase them. Replacing/deleting the database is different.

**How do you prevent accidental duplicates?** The CSV/JSON preview checks validation and possible identical category/time/coordinate signatures against database records and rows in the file. The operator explicitly confirms, and the server rechecks. It is a heuristic, not guaranteed event identity.

**How do you measure effectiveness?** CrimeMap tracks human proposals and can compare descriptive before/later synthetic incident counts; it does not establish causal intervention outcomes.

**Are the maps/overlays live police systems?** No. Map markers are fictional incident records, base tiles come from OpenStreetMap, and operational overlays are simulated.

**What would make it deployable?** Verified police-jurisdiction boundaries, authoritative data governance, security/privacy and accessibility reviews, tamper-resistant logging, more robust operational infrastructure and domain validation. This build is **local-development-only**.

## Pre-judging QA checklist (manual, not a claim that device testing was completed)

- [ ] **Desktop (1280 px or wider):** All four workspaces load; incident filters, Map navigation, Analytics charts, prevention board and downloadable PDF work.
- [ ] **Tablet (~768 px):** Sidebar workspaces remain visible in the horizontal navigation; header actions do not hide the Sign out button; charts and tables remain reachable.
- [ ] **Phone (~390 px):** Scroll the workspace rail horizontally to reach all permitted sections. The incident table scrolls horizontally instead of pushing the entire page offscreen. The incident location picker and modal fit the screen.
- [ ] **Keyboard-only:** Tab through workspace navigation and the **Choose file** button; Enter/Space opens the file picker. Add Incident, Change Password, Reset Password and Prevention dialogs keep Tab inside; Escape closes them when no save is in progress; the opener receives focus again.
- [ ] **Incident reliability:** Search and paginate records; delete the only incident on the last page (in an isolated demo database) and confirm the registry returns to the preceding nonempty page. When the backend is offline, the registry displays **Retry** rather than an ordinary “no incidents” message.
- [ ] **Persistence:** Confirm total records, stop with Ctrl+C, restart using the same database and verify that incident count and saved plans remain.
- [ ] **Accessibility/presentation:** Read every synthetic-data warning aloud when making a claim; verify PDF is labeled fictional. Avoid using color as the only explanation of hotspot classes. Test browser zoom at 200% and OS reduced-motion settings where possible.

Keep this checklist separate from automated backend/API and frontend build tests. A passing CI workflow does **not** independently verify actual appearance or keyboard behavior on every device.
