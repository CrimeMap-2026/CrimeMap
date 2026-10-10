"""Preview is read-only; confirmed imports revalidate and skip possible duplicates."""
import csv
import io
import json

from app.auth import COOKIE

EXAMPLE = {
    "category": "Theft", "occurred_at": "2026-09-12T21:30:00+05:30",
    "latitude": 11.9345, "longitude": 79.8302,
    "police_station": "Demo Zone A", "description": "SYNTHETIC TEST RECORD",
    "status": "reported",
}


def upload(client, route, records, *, skip=False, filename="preview.json"):
    payload = json.dumps(records)
    url = route + ("?skip_duplicates=true" if skip else "")
    return client.post(url, files={"file": (filename, payload, "application/json")})


def test_readonly_preview_reports_duplicate_existing_and_file(client):
    recorded = client.post("/api/incidents", json=EXAMPLE)
    assert recorded.status_code == 201
    # File contains an existing match, a repeated match, a distinct valid row,
    # then its repetition.
    newcomer = {**EXAMPLE, "longitude": 79.8306}
    rows = [EXAMPLE, EXAMPLE, newcomer, newcomer]
    response = upload(client, "/api/incidents/import/preview", rows)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["source_type"] == "synthetic"
    assert (data["total"], data["ready"], data["invalid"]) == (4, 1, 0)
    assert (data["duplicate_existing"], data["duplicate_file"]) == (1, 2)
    assert [r["status"] for r in data["rows"]] == [
        "duplicate_existing", "duplicate_file", "ready", "duplicate_file",
    ]
    assert [r["row"] for r in data["rows"]] == [1, 2, 3, 4]
    assert client.get("/api/incidents").json()["total"] == 1
    assert client.get("/api/admin/audit").json()["total"] == 1

    imported = upload(client, "/api/incidents/import", rows, skip=True)
    assert imported.status_code == 201, imported.text
    assert imported.json()["imported"] == 1
    assert imported.json()["skipped"] == 3
    assert client.get("/api/incidents").json()["total"] == 2
    assert client.get("/api/admin/audit").json()["total"] == 2

    again = upload(client, "/api/incidents/import", rows, skip=True)
    assert again.status_code == 201
    assert again.json() == {"imported": 0, "skipped": 4, "source_type": "synthetic"}
    assert client.get("/api/incidents").json()["total"] == 2
    assert client.get("/api/admin/audit").json()["total"] == 2


def test_invalid_rows_list_errors_and_confirm_stays_atomic(client):
    rows = [
        EXAMPLE,
        {**EXAMPLE, "latitude": 999},
        {**EXAMPLE, "category": "Unknown"},
        "not an object",
    ]
    checked = upload(client, "/api/incidents/import/preview", rows)
    assert checked.status_code == 200, checked.text
    data = checked.json()
    assert data["ready"] == 1
    assert data["invalid"] == 3
    assert len(data["rows"]) == 4
    assert data["rows"][1]["status"] == "invalid"
    assert "latitude" in " ".join(data["rows"][1]["errors"])
    assert "category" in " ".join(data["rows"][2]["errors"])
    assert data["rows"][3]["errors"] == ["Record must be an object"]
    assert client.get("/api/incidents").json()["total"] == 0
    denied = upload(client, "/api/incidents/import", rows, skip=True)
    assert denied.status_code == 422
    assert denied.json()["detail"]["row"] == 2
    assert client.get("/api/incidents").json()["total"] == 0
    assert client.get("/api/admin/audit").json()["total"] == 0


def test_utc_timestamp_normalization_coordinate_rounding_and_zone_difference(client):
    assert client.post("/api/incidents", json=EXAMPLE).status_code == 201
    equivalent = {
        **EXAMPLE,
        "occurred_at": "2026-09-12T16:00:00+00:00",
        "latitude": 11.93450002,
        "longitude": 79.83019998,
        "police_station": "Different demo zone",
        "status": "closed",
    }
    review = upload(client, "/api/incidents/import/preview", [equivalent]).json()
    assert review["duplicate_existing"] == 1
    assert review["ready"] == 0
    assert "Potential duplicate" in review["duplicate_rule"]


def test_warning_labels_do_not_block_valid_demo_import(client):
    rows = [
        {**EXAMPLE, "latitude": 25.2, "longitude": 80.1, "police_station": ""},
        {**EXAMPLE, "longitude": 79.8315, "police_station": None},
    ]
    response = upload(client, "/api/incidents/import/preview", rows)
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["ready"] == 2 and answer["invalid"] == 0
    assert answer["warnings"] == 2
    assert "Outside the demonstration grid extent" in answer["rows"][0]["warnings"]
    assert "Demonstration zone not specified" in answer["rows"][0]["warnings"]
    assert "Demonstration zone not specified" in answer["rows"][1]["warnings"]
    assert upload(client, "/api/incidents/import", rows, skip=True).json()["imported"] == 2


def test_preview_rechecks_database_at_confirmation(client):
    data = [{**EXAMPLE, "longitude": 79.8307}]
    assert upload(client, "/api/incidents/import/preview", data).json()["ready"] == 1
    assert client.post("/api/incidents", json=data[0]).status_code == 201
    answer = upload(client, "/api/incidents/import", data, skip=True)
    assert answer.status_code == 201
    assert answer.json()["skipped"] == 1
    assert answer.json()["imported"] == 0


def test_csv_preview_matches_json_and_legacy_import_behavior(client):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(EXAMPLE))
    writer.writeheader()
    writer.writerow(EXAMPLE)
    writer.writerow(EXAMPLE)
    response = client.post("/api/incidents/import/preview", files={
        "file": ("demo.csv", output.getvalue(), "text/csv"),
    })
    assert response.status_code == 200, response.text
    assert response.json()["ready"] == 1
    assert response.json()["duplicate_file"] == 1

    # Legacy import remains unchanged when skip_duplicates isn't specified.
    old = upload(client, "/api/incidents/import", [EXAMPLE, EXAMPLE])
    assert old.status_code == 201
    assert old.json() == {"imported": 2, "source_type": "synthetic"}
    assert client.get("/api/incidents").json()["total"] == 2


def test_preview_limits_and_permissions(client):
    assert upload(client, "/api/incidents/import/preview", []).status_code == 400
    assert upload(client, "/api/incidents/import/preview", [EXAMPLE] * 1001).status_code == 413
    assert client.post("/api/incidents/import/preview", files={
        "file": ("big.json", b" " * (2 * 1024 * 1024 + 1)),
    }).status_code == 413
    assert client.post("/api/incidents/import/preview", files={
        "file": ("invalid.txt", "oops"),
    }).status_code == 400

    response = client.post("/api/admin/users", json={
        "username": "viewerupload", "role": "viewer",
        "password": "strong-demo-test-password",
    })
    assert response.status_code == 201
    client.cookies.delete(COOKIE)
    assert upload(client, "/api/incidents/import/preview", [EXAMPLE]).status_code == 401
    assert upload(client, "/api/incidents/import", [EXAMPLE], skip=True).status_code == 401
    login = client.post("/api/auth/login", json={
        "username": "viewerupload", "password": "strong-demo-test-password",
    })
    assert login.status_code == 200
    assert upload(client, "/api/incidents/import/preview", [EXAMPLE]).status_code == 403
    assert upload(client, "/api/incidents/import", [EXAMPLE], skip=True).status_code == 403
