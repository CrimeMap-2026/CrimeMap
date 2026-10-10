"""Presentation PDF exports are generated from existing synthetic aggregates."""
from io import BytesIO

import pytest
from pypdf import PdfReader

from app.auth import COOKIE


def incident(client, *, category="Theft", zone="Demo Zone A",
             occurred_at="2026-10-02T12:00:00+05:30",
             description="PRIVATE EXAMPLE DESCRIPTION NEVER INCLUDE"):
    response = client.post("/api/incidents", json={
        "category": category, "status": "reported",
        "occurred_at": occurred_at, "latitude": 11.935, "longitude": 79.83,
        "police_station": zone, "description": description,
    })
    assert response.status_code == 201, response.text


def pdf(client, **kwargs):
    return client.get("/api/reports/presentation", params=kwargs)


def read_pdf(response):
    assert response.status_code == 200, response.text[:500]
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.headers["cache-control"] == "no-store"
    assert response.content.startswith(b"%PDF-")
    reader = PdfReader(BytesIO(response.content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return reader, text


def test_pdf_contains_one_consolidated_analytics_spatial_and_prevention_brief(client):
    incident(client)
    incident(client, occurred_at="2026-10-03T12:00:00+05:30")
    incident(client, category="Cybercrime", zone="Demo Zone B")
    plan = client.post("/api/prevention/plans", json={
        "zone": "Demo Zone A", "category": "Theft",
        "action_code": "property-awareness", "owner": "CONFIDENTIAL COORDINATOR",
        "notes": "HIDDEN PROGRESS NOTES",
    })
    assert plan.status_code == 201, plan.text
    report = pdf(client)
    reader, text = read_pdf(report)
    assert len(reader.pages) >= 4
    assert "Geospatial Crime Intelligence" in text
    assert "Incident patterns" in text
    assert "Fixed-grid geographic concentrations" in text
    assert "Saved human-reviewed action plans" in text
    assert "3" in text
    assert "Property security awareness" in text
    assert "synthetic" in text.lower()
    assert "PRIVATE EXAMPLE DESCRIPTION" not in text
    assert "CONFIDENTIAL COORDINATOR" not in text
    assert "HIDDEN PROGRESS NOTES" not in text
    # Report export is read-only; no audit event is created.
    assert client.get("/api/admin/audit").json()["total"] == 4


def test_report_section_selection_filters_and_empty_datasets(client):
    incident(client, occurred_at="2026-10-03T10:00:00+05:30")
    incident(client, occurred_at="2026-09-03T10:00:00+05:30", category="Assault")
    only_analytics = pdf(
        client, sections="analytics", start_date="2026-10-01",
        end_date="2026-10-10", category="Theft", min_count=2,
    )
    reader, text = read_pdf(only_analytics)
    assert len(reader.pages) >= 2  # Long vector charts may continue on another page.
    assert "Incident patterns" in text
    assert "Saved human-reviewed action plans" not in text
    assert "Fixed-grid geographic concentrations" not in text
    assert "Matching incidents" in text
    assert "Local incident range" in text

    only_map = pdf(client, sections="spatial", cell_size_m=500, min_count=2)
    _, text = read_pdf(only_map)
    assert "Fixed-grid geographic concentrations" in text
    assert "500 metre" in text
    assert "No geographic cells meet the selected threshold" in text

    no_plans = pdf(client, sections="prevention", zone="Missing Zone")
    _, text = read_pdf(no_plans)
    assert "No saved prevention plans match this selection" in text

    missing_zone = pdf(client, sections="analytics,spatial", unspecified_zone=True)
    _, text = read_pdf(missing_zone)
    assert "Unspecified zone" in text


@pytest.mark.parametrize("query", [
    {"sections": ""}, {"sections": "analytics,unknown"},
    {"sections": "spatial,spatial,garbage"}, {"sections": ","},
    {"start_date": "2026-11-01", "end_date": "2026-10-01"},
    {"zone": "Demo Zone A", "unspecified_zone": True},
    {"category": "not-category"}, {"status": "invalid"},
    {"min_count": 1}, {"cell_size_m": 100},
])
def test_report_rejects_invalid_queries(client, query):
    response = pdf(client, **query)
    assert response.status_code == 422, response.text[:500]


def test_report_role_enforcement(client):
    for role in ("viewer", "analyst", "officer"):
        response = client.post("/api/admin/users", json={
            "username": "report" + role, "password": "long-example-password-56789",
            "role": role,
        })
        assert response.status_code == 201
    client.cookies.delete(COOKIE)
    assert pdf(client).status_code == 401
    for role, code in (("viewer", 403), ("analyst", 200), ("officer", 200)):
        client.cookies.delete(COOKIE)
        login = client.post("/api/auth/login", json={
            "username": "report" + role, "password": "long-example-password-56789",
        })
        assert login.status_code == 200
        assert pdf(client, sections="prevention").status_code == code
