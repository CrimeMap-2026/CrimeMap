"""Analytics totals, filters, provenance, and Puducherry calendar boundaries."""
import json

import pytest
from sqlalchemy import event

import app.main as main_module


EXAMPLE = {
    "category": "Theft", "occurred_at": "2026-09-12T00:00:00+05:30",
    "latitude": 11.9345, "longitude": 79.8302,
    "police_station": "Demo Zone A", "status": "reported",
}


def add(client, **changes):
    response = client.post("/api/incidents", json={**EXAMPLE, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def overview(client, **params):
    response = client.get("/api/analytics/overview", params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source_type"] == "synthetic"
    assert body["data_label"] == "SYNTHETIC DEMONSTRATION DATA"
    assert body["timezone"] == "Asia/Kolkata"
    for dimension in ("category", "status", "date", "hour", "zone"):
        assert sum(row["count"] for row in body[f"by_{dimension}"]) == body["summary"]["total_incidents"]
    return body


def counts(body, dimension):
    return {row["key"]: row["count"] for row in body[f"by_{dimension}"]}


def test_empty_database_and_filter_options(client):
    body = overview(client)
    assert body["summary"] == {
        "total_incidents": 0, "category_count": 0, "most_frequent_category": None,
        "most_frequent_count": 0, "top_categories": [], "zone_count": 0,
        "unspecified_zone_count": 0,
    }
    assert body["by_category"] == body["by_date"] == body["by_zone"] == []
    assert len(body["by_hour"]) == 24
    assert len(body["by_status"]) == 3
    response = client.get("/api/analytics/filters")
    assert response.status_code == 200
    assert response.json()["zones"] == []
    assert response.json()["has_unspecified_zone"] is False


def test_aggregates_and_ties_include_missing_zones(client):
    add(client)
    add(client, category="Assault", status="closed", police_station="Demo Zone B")
    add(client, police_station=None, occurred_at="2026-09-14T13:10:00+05:30")
    add(client, category="Assault", status="under_investigation", police_station="  ")
    body = overview(client)
    assert body["summary"]["total_incidents"] == 4
    assert body["summary"]["category_count"] == 2
    assert body["summary"]["top_categories"] == ["Assault", "Theft"]
    assert body["summary"]["most_frequent_category"] == "Assault"
    assert body["summary"]["most_frequent_count"] == 2
    assert body["summary"]["zone_count"] == 2
    assert body["summary"]["unspecified_zone_count"] == 2
    assert counts(body, "status") == {"reported": 2, "closed": 1, "under_investigation": 1}
    assert counts(body, "date") == {"2026-09-12": 3, "2026-09-13": 0, "2026-09-14": 1}
    assert counts(body, "hour")["00"] == 3
    assert counts(body, "hour")["13"] == 1
    assert counts(body, "zone")[None] == 2
    options = client.get("/api/analytics/filters").json()
    assert options["zones"] == ["Demo Zone A", "Demo Zone B"]
    assert options["has_unspecified_zone"] is True


@pytest.mark.parametrize("params,expected", [
    ({"category": "Assault"}, 1), ({"status": "closed"}, 2),
    ({"zone": "Demo Zone A"}, 2), ({"unspecified_zone": True}, 1),
    ({"start_date": "2026-09-13"}, 2), ({"end_date": "2026-09-12"}, 1),
    ({"start_date": "2026-09-13", "end_date": "2026-09-13", "category": "Theft", "status": "closed", "zone": "Demo Zone A"}, 1),
    ({"zone": "Absent zone"}, 0), ({"category": "Robbery"}, 0),
])
def test_individual_and_combined_filters(client, params, expected):
    add(client)
    add(client, occurred_at="2026-09-13T10:00:00+05:30", status="closed")
    add(client, occurred_at="2026-09-14T10:00:00+05:30", status="closed", category="Assault", police_station=None)
    assert overview(client, **params)["summary"]["total_incidents"] == expected


def test_local_midnight_end_of_day_and_half_hour_offset(client):
    for timestamp in [
        "2026-09-11T18:29:59Z",  # previous local day
        "2026-09-11T18:30:00Z",  # midnight
        "2026-09-12T18:29:59Z",  # final local second
        "2026-09-12T18:30:00Z",  # next local day
    ]:
        add(client, occurred_at=timestamp)
    body = overview(client, start_date="2026-09-12", end_date="2026-09-12")
    assert body["summary"]["total_incidents"] == 2
    assert counts(body, "date") == {"2026-09-12": 2}
    assert counts(body, "hour")["00"] == counts(body, "hour")["23"] == 1


def test_zone_names_do_not_collide_with_missing_bucket(client):
    add(client, police_station="Unspecified zone")
    add(client, police_station=None)
    add(client, police_station="  Demo Zone A  ")
    assert overview(client, zone="Unspecified zone")["summary"]["zone_count"] == 1
    assert overview(client, unspecified_zone=True)["summary"]["zone_count"] == 0
    assert overview(client, zone="Demo Zone A")["summary"]["total_incidents"] == 1


@pytest.mark.parametrize("params", [
    {"start_date": "invalid"}, {"end_date": "2026-02-30"},
    {"start_date": "2026-09-13", "end_date": "2026-09-12"},
    {"category": "invalid"}, {"status": "invalid"},
    {"zone": "A", "unspecified_zone": True}, {"zone": " "},
    {"zone": "x" * 121}, {"unspecified_zone": "invalid"},
])
def test_invalid_filters(client, params):
    assert client.get("/api/analytics/overview", params=params).status_code == 422


def test_aggregates_are_not_limited_by_incident_pagination(client):
    records = [{**EXAMPLE, "category": "Theft" if i < 220 else "Assault"} for i in range(250)]
    result = client.post("/api/incidents/import", files={"file": ("demo.json", json.dumps(records), "application/json")})
    assert result.status_code == 201
    assert len(client.get("/api/incidents").json()["items"]) == 25
    statements = []

    def capture(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    event.listen(main_module.engine, "before_cursor_execute", capture)
    try:
        body = overview(client)
    finally:
        event.remove(main_module.engine, "before_cursor_execute", capture)
    # Authentication uses separate user/session lookups; the analytic query itself
    # must remain one database aggregation without N+1 incident reads.
    statements = [sql for sql in statements if "matching_incidents" in sql]
    assert len(statements) == 1
    assert "GROUP BY" in statements[0] and "UNION ALL" in statements[0]
    assert body["summary"]["total_incidents"] == 250
    assert counts(body, "category") == {"Theft": 220, "Assault": 30}


@pytest.mark.parametrize("end,interval,key", [
    ("2026-09-14", "day", "2026-09-11"),
    ("2028-01-01", "month", "2026-10"),
    ("2060-01-01", "year", "2027"),
])
def test_trend_zero_fill_and_adaptive_intervals(client, end, interval, key):
    add(client)
    body = overview(client, start_date="2026-09-11", end_date=end)
    assert body["trend_interval"] == interval
    assert counts(body, "date")[key] == 0
    assert len(body["by_date"]) < 400


def test_changes_are_reflected_without_cached_totals(client):
    incident = add(client)
    assert overview(client, status="reported")["summary"]["total_incidents"] == 1
    assert client.patch(f"/api/incidents/{incident['id']}", json={"status": "closed"}).status_code == 200
    assert overview(client, status="reported")["summary"]["total_incidents"] == 0
    assert overview(client, status="closed")["summary"]["total_incidents"] == 1
    assert client.delete(f"/api/incidents/{incident['id']}").status_code == 204
    assert overview(client)["summary"]["total_incidents"] == 0


def test_non_synthetic_rows_are_never_presented_as_demo_statistics(client):
    from app.models import Incident
    from sqlalchemy import update

    incident = add(client, police_station="Excluded zone")
    with main_module.engine.begin() as conn:
        conn.execute(update(Incident).where(Incident.id == incident["id"]).values(source_type="official"))
    assert overview(client)["summary"]["total_incidents"] == 0
    assert client.get("/api/analytics/filters").json()["zones"] == []
