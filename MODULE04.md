# Module 04 — Prevention & Action Planner

CrimeMap now includes a dedicated **Prevention planner** page to address the hackathon's "Map · Analyse · Predict · Prevent" theme, without claiming that the synthetic dataset supports real crime prediction.

## The end-to-end presentation flow

1. Sign in as an **Analyst** or above. Open **Prevention planner** in the sidebar.
2. Filter by demonstration zone, crime category, and inclusive date range in **Indian Standard Time**.
3. Review the count-backed **observations**. Each card shows the demonstration zone, incident type, number of matching **fictional** incidents, share of the filtered incidents, and two associated preventive-measure options.
4. Explain a measure in human terms. Examples include vehicle-security awareness, community property-security education, digital scam prevention, better visibility/lighting maintenance reviews, and victim-support referrals.
5. If logged in as an **Officer** or **Administrator**, click **Create action plan**, assign a fictional coordinator, optional due date, and review/evaluation notes. This saves a record in the local database.
6. In the **Prevention action board**, advance the status: Proposed → In progress → Completed (or Cancelled). Edit the responsible coordinator, due date or progress notes separately.
7. Click **Print summary** to use the browser's Print to PDF capability, or **Export plans** to download a CSV with the tracked proposals.

A completed example plan documents that an activity was marked completed, **not** that the activity reduced crime.

## Authorization

| Capability | Viewer | Analyst | Officer | Admin |
| --- | --- | --- | --- | --- |
| Open prevention page and view observations | No | Yes | Yes | Yes |
| View saved plans and print/export summary | No | Yes | Yes | Yes |
| Create plans from category/zone suggestions | No | No | Yes | Yes |
| Update statuses, owners, due dates, notes | No | No | Yes | Yes |

FastAPI enforces each permission independently of React. Every saved plan records its creator's user ID and timestamps.

## APIs

- `GET /api/prevention/insights?zone=&category=&start_date=&end_date=` — descriptive, filtered counts by demonstration zone and incident category, plus a static library of safeguarding options. Requires Analyst or higher.
- `GET /api/prevention/plans` — up to 200 most recent saved plans. Requires Analyst or higher.
- `POST /api/prevention/plans` — create a plan after the server rechecks the incident count for its zone/category/date selection; derives title, action and rationale server-side rather than trusting browser-supplied evidence. Requires Officer or Administrator.
- `PATCH /api/prevention/plans/{id}` — update status (with checked transitions), owner, due date, or progress notes. Requires Officer or Administrator.

New `prevention_plans` SQLAlchemy table is added automatically when FastAPI starts, on the selected SQLite/PostgreSQL connection. Existing `incidents`, `users` and `login_sessions` data is **not wiped or reseeded**.

## Constraints and safeguards

- Group counts reflect only the current dataset, never observed real crime in Puducherry.
- Higher counts do **not** imply higher per-person risk, statistical significance, predictive accuracy, or causation.
- Suggestions are fixed, category-specific general guidance, **not** generated patrol routes, automatic officer assignments, surveillance targets, or a dispatch tool.
- Demonstration zones are fabricated names; verified locality information and authoritative data would be required before real deployment.
- Proposals require a human decision and consideration of accessibility, privacy, proportionality and community input.
- Outcome evaluation and any causal claims would require suitable validated records and well-designed studies; merely ticking a plan "completed" is not evidence of impact.
- This prototype still needs production-grade audit trails, migrations, robust identity management and an independent security review before handling real police or citizen information.

## Run

From the repository root after pulling the latest branch:

```fish
python3 start.py
```

Sign in and choose **Prevention planner**. If a brand-new SQLite database is empty, first run `python -m scripts.seed_demo` inside `backend/` and create the administrator account with `python -m app.bootstrap_admin`.

The original synthetic incident dataset (100 sample incidents) and other CrimeMap features remain unchanged.
