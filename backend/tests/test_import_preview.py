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


def test_shipped_seed_csv_with_id_previews_as_ready_and_imports_with_server_ids(client):
    """Regression: the user's data/synthetic_incidents.csv has an id column."""
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "data" / "synthetic_incidents.csv"
    raw = path.read_bytes()
    preview = client.post("/api/incidents/import/preview", files={
        "file": (path.name, raw, "text/csv"),
    })
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert (data["total"], data["ready"], data["invalid"]) == (100, 100, 0)
    assert (data["duplicate_existing"], data["duplicate_file"]) == (0, 0)
    assert client.get("/api/incidents").json()["total"] == 0

    confirm = client.post("/api/incidents/import?skip_duplicates=true", files={
        "file": (path.name, raw, "text/csv"),
    })
    assert confirm.status_code == 201, confirm.text
    assert confirm.json() == {"imported": 100, "skipped": 0, "source_type": "synthetic"}
    stored = client.get("/api/incidents", params={"limit": 200}).json()
    assert stored["total"] == 100
    # The CSV's DEMO IDs were import metadata, not attacker-controlled keys.
    assert all(not row["id"].startswith("DEMO-") for row in stored["items"])

    repeat = client.post("/api/incidents/import/preview", files={
        "file": (path.name, raw, "text/csv"),
    }).json()
    assert (repeat["ready"], repeat["duplicate_existing"], repeat["invalid"]) == (0, 100, 0)


def test_shipped_seed_csv_against_existing_100_demo_ids_is_all_duplicate(client):
    """A database populated by the seed script must not gain 100 repeat rows."""
    import csv
    from pathlib import Path
    from sqlalchemy.orm import Session

    import app.main as main_module
    from app.models import Incident
    from app.schemas import IncidentCreate

    path = Path(__file__).resolve().parents[2] / "data" / "synthetic_incidents.csv"
    with Session(main_module.engine) as db, path.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            model = IncidentCreate.model_validate({key: value for key, value in row.items() if key != "id"})
            db.add(Incident(
                id=row["id"], category=model.category.value,
                occurred_at=model.occurred_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                latitude=model.latitude, longitude=model.longitude,
                police_station=model.police_station, description=model.description,
                status=model.status.value, source_type="synthetic",
            ))
        db.commit()

    raw = path.read_bytes()
    preview = client.post("/api/incidents/import/preview", files={
        "file": (path.name, raw, "text/csv"),
    })
    assert preview.status_code == 200, preview.text
    summary = preview.json()
    assert summary["total"] == 100
    assert summary["invalid"] == 0
    assert summary["ready"] == 0
    assert summary["duplicate_existing"] == 100
    assert client.get("/api/incidents").json()["total"] == 100

    confirm = client.post("/api/incidents/import?skip_duplicates=true", files={
        "file": (path.name, raw, "text/csv"),
    })
    assert confirm.status_code == 201, confirm.text
    assert confirm.json()["imported"] == 0
    assert confirm.json()["skipped"] == 100
    assert client.get("/api/incidents").json()["total"] == 100
    assert client.get("/api/admin/audit").json()["total"] == 0


def test_optional_id_does_not_relax_validation_for_any_other_extra_field(client):
    valid = {**EXAMPLE, "id": "DEMO-0001"}
    preview = upload(client, "/api/incidents/import/preview", [
        valid, {**valid, "unexpected_column": "must remain forbidden"},
    ])
    assert preview.status_code == 200
    body = preview.json()
    assert body["ready"] == 1 and body["invalid"] == 1
    assert "unexpected_column" in " ".join(body["rows"][1]["errors"])
    assert client.get("/api/incidents").json()["total"] == 0
    denied = upload(client, "/api/incidents/import", [
        valid, {**valid, "unexpected_column": "must remain forbidden"},
    ], skip=True)
    assert denied.status_code == 422
    assert client.get("/api/incidents").json()["total"] == 0
