import csv
import io
import json


EXAMPLE = {
    "category": "Vehicle Theft",
    "occurred_at": "2026-09-12T21:30:00+05:30",
    "latitude": 11.9345,
    "longitude": 79.8302,
    "police_station": "Demo Zone A",
    "description": "SYNTHETIC TEST RECORD",
    "status": "reported",
}


def test_create_list_get_update_delete(client):
    response = client.post("/api/incidents", json=EXAMPLE)
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["source_type"] == "synthetic"
    assert created["occurred_at"] == "2026-09-12T16:00:00Z"
    key = created["id"]

    response = client.get("/api/incidents", params={"category": "Vehicle Theft"})
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == key
    assert client.get(f"/api/incidents/{key}").status_code == 200

    response = client.patch(f"/api/incidents/{key}", json={"status": "closed"})
    assert response.status_code == 200
    assert response.json()["status"] == "closed"

    assert client.delete(f"/api/incidents/{key}").status_code == 204
    assert client.get(f"/api/incidents/{key}").status_code == 404


def test_reject_invalid_and_unlabelled_records(client):
    assert client.post("/api/incidents", json={**EXAMPLE, "latitude": 100}).status_code == 422
    assert client.post("/api/incidents", json={**EXAMPLE, "occurred_at": "2026-09-12T21:30:00"}).status_code == 422
    assert client.post("/api/incidents", json={**EXAMPLE, "source_type": "official"}).status_code == 422
    assert client.get("/api/incidents").json()["total"] == 0


def test_json_import_is_atomic(client):
    records = [EXAMPLE, {**EXAMPLE, "longitude": 999}]
    response = client.post("/api/incidents/import", files={"file": ("demo.json", json.dumps(records), "application/json")})
    assert response.status_code == 422
    assert response.json()["detail"]["row"] == 2
    assert client.get("/api/incidents").json()["total"] == 0

    response = client.post("/api/incidents/import", files={"file": ("demo.json", json.dumps([EXAMPLE, EXAMPLE]), "application/json")})
    assert response.status_code == 201
    assert response.json()["imported"] == 2
    assert client.get("/api/incidents").json()["total"] == 2


def test_csv_import_and_filter(client):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(EXAMPLE))
    writer.writeheader()
    writer.writerow(EXAMPLE)
    response = client.post("/api/incidents/import", files={"file": ("demo.csv", output.getvalue(), "text/csv")})
    assert response.status_code == 201, response.text
    assert response.json()["source_type"] == "synthetic"
    assert client.get("/api/incidents", params={"q": "zone a"}).json()["total"] == 1
    assert client.get("/api/incidents", params={"status": "closed"}).json()["total"] == 0


def test_max_upload_size(client):
    response = client.post("/api/incidents/import", files={"file": ("oversize.json", " " * (2 * 1024 * 1024 + 1))})
    assert response.status_code == 413


def test_pagination(client):
    for i in range(3):
        response = client.post("/api/incidents", json={**EXAMPLE, "description": f"Record {i}"})
        assert response.status_code == 201
    response = client.get("/api/incidents", params={"limit": 2, "offset": 1})
    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert len(response.json()["items"]) == 2


def test_shipped_sample_csv_imports(client):
    from pathlib import Path
    sample = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sample-data" / "synthetic_incidents.csv"
    with sample.open("rb") as source:
        response = client.post("/api/incidents/import", files={"file": (sample.name, source, "text/csv")})
    assert response.status_code == 201, response.text
    assert response.json() == {"imported": 100, "source_type": "synthetic"}
    assert client.get("/api/incidents").json()["total"] == 100
