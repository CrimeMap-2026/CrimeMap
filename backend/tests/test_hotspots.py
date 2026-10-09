"""Grid counts, filters, geometry, provenance, and read-only consistency."""
import json
from math import cos, pi

import pytest
from sqlalchemy import event, select, update

import app.main as main_module
from app.models import Incident


EXAMPLE = {
    "category": "Theft", "occurred_at": "2026-09-12T00:00:00+05:30",
    "latitude": 11.9355, "longitude": 79.8305,
    "police_station": "Demo Zone A", "status": "reported",
}


def add(client, **changes):
    response = client.post("/api/incidents", json={**EXAMPLE, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def grid(client, **params):
    response = client.get("/api/hotspots/grid", params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    meta = body["meta"]
    assert body["type"] == "FeatureCollection"
    assert meta["source_type"] == "synthetic"
    assert meta["data_label"] == "SYNTHETIC DEMONSTRATION DATA"
    assert meta["timezone"] == "Asia/Kolkata"
    assert meta["method"] == "grid_count"
    assert meta["total_matching_incidents"] == meta["analyzed_incidents"] + meta["excluded_incidents"]
    assert meta["qualifying_cells"] == len(body["features"])
    assert meta["incidents_in_qualifying_cells"] == sum(row["properties"]["count"] for row in body["features"])
    assert meta["incidents_in_qualifying_cells"] <= meta["analyzed_incidents"]
    assert all(row["properties"]["count"] >= meta["min_count"] for row in body["features"])
    return body


def test_empty_database(client):
    body = grid(client)
    assert body["features"] == []
    for metric in (
        "total_matching_incidents", "analyzed_incidents", "excluded_incidents", "occupied_cells",
        "qualifying_cells", "incidents_in_qualifying_cells", "max_cell_count",
    ):
        assert body["meta"][metric] == 0
    assert body["meta"]["cell_size_m"] == 1000
    assert body["meta"]["min_count"] == 3
    assert body["meta"]["study_bounds"] == {"south": 11.75, "west": 79.6, "north": 12.15, "east": 79.95}


def test_threshold_counts_duplicate_coordinates_ties_and_nominal_density(client):
    for count, longitude in [(4, 79.8305), (4, 79.8505), (2, 79.8705), (1, 79.8905)]:
        for _ in range(count):
            add(client, longitude=longitude)
    body = grid(client, cell_size_m=500, min_count=2)
    assert body["meta"]["total_matching_incidents"] == 11
    assert body["meta"]["occupied_cells"] == 4
    assert body["meta"]["max_cell_count"] == 4
    assert body["meta"]["incidents_in_qualifying_cells"] == 10
    assert [row["properties"]["count"] for row in body["features"]] == [4, 4, 2]
    assert [row["properties"]["rank"] for row in body["features"]] == [1, 1, 2]
    assert [row["properties"]["density_per_km2"] for row in body["features"]] == [16, 16, 8]
    assert body == grid(client, cell_size_m=500, min_count=2)
    below = grid(client, min_count=5)
    assert below["features"] == []
    assert below["meta"]["occupied_cells"] == 4
    assert below["meta"]["analyzed_incidents"] == 11
    assert below["meta"]["max_cell_count"] == 4


def test_geojson_closed_lon_lat_ring_size_and_stable_alignment(client):
    for _ in range(2):
        add(client)
        add(client, category="Assault")
    original = grid(client, min_count=2)["features"][0]
    filtered = grid(client, category="Assault", min_count=2)["features"][0]
    assert original["id"] == original["properties"]["cell_id"] == filtered["id"]
    assert original["geometry"] == filtered["geometry"]
    assert original["properties"]["count"] == 4
    assert filtered["properties"]["count"] == 2
    assert original["properties"]["source_type"] == "synthetic"
    assert original["geometry"]["type"] == "Polygon"
    ring = original["geometry"]["coordinates"][0]
    assert len(ring) == 5 and ring[0] == ring[-1]
    west, south = ring[0]
    east, north = ring[2]
    assert west <= EXAMPLE["longitude"] < east
    assert south <= EXAMPLE["latitude"] < north
    assert (east - west) * 6_371_008.8 * pi / 180 * cos(11.935 * pi / 180) == pytest.approx(1000)
    assert (north - south) * 6_371_008.8 * pi / 180 == pytest.approx(1000)
    larger = grid(client, cell_size_m=2000, min_count=2)["features"][0]
    assert larger["id"] != original["id"]
    assert larger["properties"]["density_per_km2"] == 1


def test_cells_on_both_sides_of_origin_have_no_overlap_or_double_counting(client):
    for latitude, longitude in [
        (11.935, 79.83), (11.935 + 0.000001, 79.83 + 0.000001),
        (11.935 - 0.000001, 79.83 - 0.000001), (11.935 - 0.000002, 79.83 - 0.000002),
    ]:
        add(client, latitude=latitude, longitude=longitude)
    body = grid(client, min_count=2)
    assert body["meta"]["occupied_cells"] == 2
    assert [row["properties"]["count"] for row in body["features"]] == [2, 2]
    first, second = [row["geometry"]["coordinates"][0] for row in body["features"]]
    assert first[2] == second[0] == [79.83, 11.935]


@pytest.mark.parametrize("params,expected", [
    ({"category": "Assault"}, 1), ({"status": "closed"}, 2),
    ({"zone": "Demo Zone A"}, 2), ({"unspecified_zone": True}, 1),
    ({"start_date": "2026-09-13"}, 2), ({"end_date": "2026-09-12"}, 1),
    ({"start_date": "2026-09-13", "end_date": "2026-09-13", "category": "Theft", "status": "closed", "zone": "Demo Zone A"}, 1),
    ({"category": "Robbery"}, 0), ({"zone": "Absent zone"}, 0),
])
def test_individual_and_combined_filters_match_analytics(client, params, expected):
    add(client)
    add(client, occurred_at="2026-09-13T10:00:00+05:30", status="closed")
    add(client, occurred_at="2026-09-14T10:00:00+05:30", status="closed", category="Assault", police_station=None)
    body = grid(client, min_count=2, **params)
    assert body["meta"]["total_matching_incidents"] == expected
    assert client.get("/api/analytics/overview", params=params).json()["summary"]["total_incidents"] == expected
    if expected < 2:
        assert body["features"] == []


def test_inclusive_ist_dates_at_local_midnight_and_end_of_day(client):
    for timestamp in ["2026-09-11T18:29:59Z", "2026-09-11T18:30:00Z", "2026-09-12T18:29:59Z", "2026-09-12T18:30:00Z"]:
        add(client, occurred_at=timestamp)
    body = grid(client, start_date="2026-09-12", end_date="2026-09-12", min_count=2)
    assert body["meta"]["analyzed_incidents"] == 2
    assert body["features"][0]["properties"]["count"] == 2


def test_missing_zones_do_not_collide_with_names(client):
    add(client, police_station="Unspecified zone")
    add(client, police_station=None)
    add(client, police_station="  ")
    add(client, police_station="  Demo Zone A  ")
    assert grid(client, zone="Unspecified zone")["meta"]["total_matching_incidents"] == 1
    assert grid(client, unspecified_zone=True)["meta"]["total_matching_incidents"] == 2
    assert grid(client, zone=" Demo Zone A ")["meta"]["total_matching_incidents"] == 1


def test_inclusive_study_bounds_exclusions_and_synthetic_only(client):
    for latitude, longitude in [(11.75, 79.6), (12.15, 79.95), (11.75, 79.95), (12.15, 79.6)]:
        add(client, latitude=latitude, longitude=longitude)
    for latitude, longitude in [(11.74999, 79.8), (12.15001, 79.8), (11.9, 79.59999), (11.9, 79.95001)]:
        add(client, latitude=latitude, longitude=longitude)
    official = add(client)
    with main_module.engine.begin() as conn:
        conn.execute(update(Incident).where(Incident.id == official["id"]).values(source_type="official"))
    body = grid(client, min_count=2)
    assert body["meta"]["total_matching_incidents"] == 8
    assert body["meta"]["analyzed_incidents"] == 4
    assert body["meta"]["excluded_incidents"] == 4
    assert body["meta"]["occupied_cells"] == 4
    assert body["features"] == []


def test_outside_study_matches_have_explicit_counts(client):
    add(client, latitude=13)
    body = grid(client)
    assert body["meta"]["total_matching_incidents"] == body["meta"]["excluded_incidents"] == 1
    assert body["meta"]["analyzed_incidents"] == body["meta"]["occupied_cells"] == 0
    assert body["features"] == []


@pytest.mark.parametrize("params", [
    {"start_date": "invalid"}, {"end_date": "2026-02-30"},
    {"start_date": "2026-09-13", "end_date": "2026-09-12"}, {"start_date": "0001-01-01"},
    {"category": "invalid"}, {"status": "invalid"},
    {"zone": "A", "unspecified_zone": True}, {"zone": " "}, {"zone": "x" * 121},
    {"unspecified_zone": "invalid"}, {"cell_size_m": 249}, {"cell_size_m": 5001},
    {"cell_size_m": 1000.5}, {"cell_size_m": "nan"}, {"min_count": 1},
    {"min_count": 1001}, {"min_count": 2.5},
])
def test_invalid_filters_and_grid_parameters(client, params):
    response = client.get("/api/hotspots/grid", params=params)
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("cell_size_m,min_count", [(250, 2), (5000, 1000)])
def test_valid_grid_parameter_limits(client, cell_size_m, min_count):
    meta = grid(client, cell_size_m=cell_size_m, min_count=min_count)["meta"]
    assert meta["cell_size_m"] == cell_size_m
    assert meta["min_count"] == min_count


def test_complete_database_aggregation_in_one_read_only_statement(client):
    rows = [{**EXAMPLE, "longitude": 79.8305 if i < 220 else 79.8505} for i in range(250)]
    response = client.post("/api/incidents/import", files={"file": ("demo.json", json.dumps(rows), "application/json")})
    assert response.status_code == 201
    assert len(client.get("/api/incidents").json()["items"]) == 25
    with main_module.engine.connect() as conn:
        before = conn.execute(select(Incident).order_by(Incident.id)).all()
    statements = []

    def capture(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    event.listen(main_module.engine, "before_cursor_execute", capture)
    try:
        body = grid(client)
    finally:
        event.remove(main_module.engine, "before_cursor_execute", capture)
    # Authentication uses separate user/session lookups; the analytic query itself
    # must remain one database aggregation without N+1 incident reads.
    statements = [sql for sql in statements if "matching_incidents" in sql]
    assert len(statements) == 1
    assert "GROUP BY" in statements[0] and "UNION ALL" in statements[0]
    assert "LIMIT" not in statements[0]
    assert body["meta"]["analyzed_incidents"] == 250
    assert [row["properties"]["count"] for row in body["features"]] == [220, 30]
    with main_module.engine.connect() as conn:
        assert conn.execute(select(Incident).order_by(Incident.id)).all() == before


def test_edits_and_deletions_update_grid_without_stale_results(client):
    first = add(client)
    second = add(client)
    assert grid(client, min_count=2)["meta"]["qualifying_cells"] == 1
    assert client.patch(f"/api/incidents/{first['id']}", json={"status": "closed"}).status_code == 200
    assert grid(client, status="reported", min_count=2)["features"] == []
    assert client.delete(f"/api/incidents/{second['id']}").status_code == 204
    assert grid(client)["meta"]["total_matching_incidents"] == 1
