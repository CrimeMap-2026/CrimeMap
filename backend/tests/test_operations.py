from datetime import datetime


def test_synthetic_operational_overview_metadata(client):
    response = client.get("/api/operations/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["source_type"] == "synthetic"
    assert data["data_label"] == "SYNTHETIC DEMONSTRATION DATA"
    assert data["simulation"] is True
    assert data["live_tracking"] is False
    assert data["timezone"] == "Asia/Kolkata"
    assert len(data["patrols"]) == 3
    assert len(data["cameras"]) == 5
    assert len(data["accidents"]) == 4


def test_operational_points_are_fictional_and_well_formed(client):
    data = client.get("/api/operations/overview").json()
    all_ids = []
    for collection in ("cameras", "accidents"):
        for asset in data[collection]:
            all_ids.append(asset["id"])
            assert asset["id"].startswith("DEMO-")
            assert asset["source_type"] == "synthetic"
            assert 11.7 <= asset["latitude"] <= 12.2
            assert 79.6 <= asset["longitude"] <= 80.0
    for patrol in data["patrols"]:
        all_ids.append(patrol["id"])
        assert patrol["id"].startswith("DEMO-")
        assert patrol["source_type"] == "synthetic"
        assert len(patrol["track"]) == data["timeline"]["steps"]
        timestamps = []
        for point in patrol["track"]:
            assert 11.7 <= point["latitude"] <= 12.2
            assert 79.6 <= point["longitude"] <= 80.0
            timestamp = datetime.fromisoformat(point["timestamp"])
            assert timestamp.utcoffset().total_seconds() == 19800
            timestamps.append(timestamp)
        assert timestamps == sorted(set(timestamps))
        assert all((b-a).total_seconds() == 600 for a, b in zip(timestamps, timestamps[1:]))
    assert len(all_ids) == len(set(all_ids))


def test_operational_data_is_stable_and_read_only(client):
    first = client.get("/api/operations/overview")
    second = client.get("/api/operations/overview")
    assert first.json() == second.json()
    assert client.post("/api/operations/overview", json={}).status_code == 405
    assert client.patch("/api/operations/overview", json={}).status_code == 405
