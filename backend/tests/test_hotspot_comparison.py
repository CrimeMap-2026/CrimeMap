"""Regression tests for descriptive temporal fixed-grid comparisons."""
import pytest

from app.auth import COOKIE

BASE = {
    "previous_start_date": "2026-07-01", "previous_end_date": "2026-07-07",
    "current_start_date": "2026-08-01", "current_end_date": "2026-08-07",
    "cell_size_m": 500, "min_count": 2,
}


def incident(client, timestamp, longitude=79.8305, zone="Demo A"):
    response = client.post("/api/incidents", json={
        "category": "Theft", "status": "reported", "occurred_at": timestamp,
        "latitude": 11.9355, "longitude": longitude, "police_station": zone,
        "description": "Synthetic example",
    })
    assert response.status_code == 201, response.text


def result(client, **params):
    response = client.get("/api/hotspots/compare", params={**BASE, **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_comparison_classifications_and_stable_geometry(client):
    for prev, current, longitude in [
        (1, 3, 79.8305), (4, 2, 79.8405), (2, 0, 79.8505),
        (1, 1, 79.8605),
    ]:
        for _ in range(prev):
            incident(client, "2026-07-03T12:00:00+05:30", longitude)
        for _ in range(current):
            incident(client, "2026-08-03T12:00:00+05:30", longitude)
    answer = result(client)
    meta = answer["meta"]
    assert (meta["total_previous"], meta["total_current"]) == (8, 6)
    assert meta["period_days"] == 7
    assert meta["displayed_cells"] == 3
    assert (meta["cells_newly_above_threshold"], meta["cells_persistently_above_threshold"],
            meta["cells_fell_below_threshold"]) == (1, 1, 1)
    classifications = {f["properties"]["classification"]: f for f in answer["features"]}
    assert classifications["newly_above_threshold"]["properties"]["change"] == 2
    assert classifications["persistently_above_threshold"]["properties"]["change"] == -2
    assert classifications["fell_below_threshold"]["properties"]["change"] == -2
    single = client.get("/api/hotspots/grid", params={
        "cell_size_m": 500, "min_count": 2,
        "start_date": "2026-07-01", "end_date": "2026-07-07",
    }).json()
    previous_shapes = {f["id"]: f["geometry"] for f in single["features"]}
    for feature in answer["features"]:
        if feature["id"] in previous_shapes:
            assert feature["geometry"] == previous_shapes[feature["id"]]


def test_empty_exclusions_and_filters(client):
    assert result(client)["features"] == []
    incident(client, "2026-07-02T12:00:00+05:30", zone="Demo A")
    incident(client, "2026-08-02T12:00:00+05:30", zone="Demo B")
    assert result(client, zone="Demo A")["meta"]["total_current"] == 0
    assert result(client, zone="Demo B")["meta"]["total_previous"] == 0
    assert result(client, category="Assault")["meta"]["total_previous"] == 0


@pytest.mark.parametrize("invalid", [
    {"previous_start_date": "2026-07-08"},
    {"current_end_date": "2026-08-06"},
    {"current_start_date": "2026-07-07", "current_end_date": "2026-07-13"},
    {"previous_start_date": "2026-09-01", "previous_end_date": "2026-09-07"},
    {"category": "invalid"},
    {"min_count": 1},
    {"cell_size_m": 200},
    {"zone": "A", "unspecified_zone": True},
])
def test_invalid_ranges_and_parameters(client, invalid):
    response = client.get("/api/hotspots/compare", params={**BASE, **invalid})
    assert response.status_code == 422, response.text


def test_comparison_analyst_permission(client):
    user = client.post("/api/admin/users", json={
        "username": "viewercomparison", "password": "test-viewer-strong-password", "role": "viewer",
    })
    assert user.status_code == 201
    client.cookies.delete(COOKIE)
    assert client.get("/api/hotspots/compare", params=BASE).status_code == 401
    login = client.post("/api/auth/login", json={
        "username": "viewercomparison", "password": "test-viewer-strong-password",
    })
    assert login.status_code == 200
    assert client.get("/api/hotspots/compare", params=BASE).status_code == 403
