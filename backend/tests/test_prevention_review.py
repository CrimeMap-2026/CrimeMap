"""Read-only completed-plan observation reviews over equal IST date windows."""
import pytest

from app.auth import COOKIE


BASE = {
    "previous_start_date": "2026-09-01", "previous_end_date": "2026-09-10",
    "followup_start_date": "2026-10-01", "followup_end_date": "2026-10-10",
}


def incident(client, when, *, category="Theft", zone="Demo Zone A"):
    response = client.post("/api/incidents", json={
        "category": category, "occurred_at": when, "latitude": 11.935,
        "longitude": 79.83, "police_station": zone,
        "description": "SYNTHETIC DEMO record", "status": "reported",
    })
    assert response.status_code == 201, response.text


def plan(client, zone="Demo Zone A", category="Theft", action_code="property-awareness"):
    result = client.post("/api/prevention/plans", json={
        "zone": zone, "category": category, "action_code": action_code,
        "owner": "Fictional coordinator",
    })
    assert result.status_code == 201, result.text
    return result.json()["id"]


def complete(client, pid):
    for status in ("in_progress", "completed"):
        result = client.patch(f"/api/prevention/plans/{pid}", json={"status": status})
        assert result.status_code == 200, result.text


def review(client, pid, **params):
    return client.get(f"/api/prevention/plans/{pid}/review", params={**BASE, **params})


def test_completed_plan_counts_both_ist_periods_and_no_writes(client):
    incident(client, "2026-09-01T00:00:00+05:30")
    incident(client, "2026-09-10T23:59:59+05:30")
    incident(client, "2026-10-01T00:00:00+05:30")
    incident(client, "2026-10-10T23:59:59+05:30")
    incident(client, "2026-10-05T13:00:00+05:30")
    incident(client, "2026-10-05T13:00:00+05:30", category="Cybercrime")
    incident(client, "2026-10-05T13:00:00+05:30", zone="Demo Zone B")
    incident(client, "2026-09-11T00:00:00+05:30")
    identifier = plan(client)
    complete(client, identifier)
    before = client.get("/api/admin/audit").json()["total"]
    result = review(client, identifier)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["source_type"] == "synthetic"
    assert data["timezone"] == "Asia/Kolkata"
    assert data["plan_status"] == "completed"
    assert data["plan_id"] == identifier
    assert data["zone"] == "Demo Zone A" and data["category"] == "Theft"
    assert data["days_per_period"] == 10
    assert data["previous_count"] == 2
    assert data["followup_count"] == 3
    assert data["absolute_change"] == 1
    assert data["percent_change"] == 50.0
    assert "cannot be attributed" in " ".join(data["limitations"]).lower()
    assert client.get("/api/admin/audit").json()["total"] == before


def test_zero_baseline_has_no_misleading_percent(client):
    incident(client, "2026-10-02T09:00:00+05:30")
    identifier = plan(client)
    complete(client, identifier)
    result = review(client, identifier)
    assert result.status_code == 200
    assert result.json()["previous_count"] == 0
    assert result.json()["followup_count"] == 1
    assert result.json()["absolute_change"] == 1
    assert result.json()["percent_change"] is None


def test_unspecified_zone_is_kept_distinct_from_named_zone(client):
    incident(client, "2026-09-02T09:00:00+05:30", zone=None)
    incident(client, "2026-10-02T09:00:00+05:30", zone=None)
    incident(client, "2026-10-02T09:00:00+05:30", zone="Unspecified zone")
    identifier = plan(client, zone="__unspecified__")
    complete(client, identifier)
    data = review(client, identifier).json()
    assert data["zone_label"] == "Unspecified zone"
    assert data["previous_count"] == 1
    assert data["followup_count"] == 1


@pytest.mark.parametrize("change", [
    {"previous_start_date": "2026-09-11"},
    {"previous_end_date": "2026-09-11"},
    {"followup_start_date": "2026-09-09", "followup_end_date": "2026-09-18"},
    {"followup_start_date": "2026-08-01", "followup_end_date": "2026-08-10"},
    {"previous_start_date": "2026-09-10", "previous_end_date": "2026-09-01"},
    {"followup_start_date": "2026-10-11", "followup_end_date": "2026-10-01"},
    {"followup_start_date": "invalid"},
    {"previous_start_date": "2024-01-01", "previous_end_date": "2025-01-02",
     "followup_start_date": "2025-02-01", "followup_end_date": "2026-02-02"},
])
def test_invalid_periods_are_rejected(client, change):
    incident(client, "2026-09-02T09:00:00+05:30")
    identifier = plan(client)
    complete(client, identifier)
    response = review(client, identifier, **change)
    assert response.status_code == 422, response.text


def test_only_completed_plans_can_be_reviewed(client):
    incident(client, "2026-09-02T09:00:00+05:30")
    identifier = plan(client)
    assert review(client, identifier).status_code == 422
    assert review(client, "not-a-plan").status_code == 404
    assert client.patch(f"/api/prevention/plans/{identifier}", json={"status": "cancelled"}).status_code == 200
    assert review(client, identifier).status_code == 422


def test_review_role_gating(client):
    incident(client, "2026-09-02T09:00:00+05:30")
    identifier = plan(client)
    complete(client, identifier)
    for role in ("viewer", "analyst"):
        response = client.post("/api/admin/users", json={
            "username": "review_" + role, "password": "long-example-password-12345",
            "role": role,
        })
        assert response.status_code == 201
    client.cookies.delete(COOKIE)
    assert review(client, identifier).status_code == 401
    for role, expected in (("viewer", 403), ("analyst", 200)):
        client.cookies.delete(COOKIE)
        login = client.post("/api/auth/login", json={
            "username": "review_" + role, "password": "long-example-password-12345",
        })
        assert login.status_code == 200
        assert review(client, identifier).status_code == expected
