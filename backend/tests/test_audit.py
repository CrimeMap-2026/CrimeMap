"""Audit logs: attribution, privacy, access, rejected writes and transaction behavior."""
import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session

import app.main as main_module
from app.audit import record_event
from app.audit_models import AuditEvent
from app.auth import COOKIE
from app.auth_models import User
from app.models import Incident


INCIDENT = {
    "category": "Theft", "occurred_at": "2026-09-12T12:00:00+05:30",
    "latitude": 11.935, "longitude": 79.83, "police_station": "Demo Zone A",
    "description": "Private-looking test note MUST NOT BE LOGGED", "status": "reported",
}


def history(client, **query):
    response = client.get("/api/admin/audit", params=query)
    assert response.status_code == 200, response.text
    return response.json()


def test_incident_mutations_and_import_are_logged_without_sensitive_text(client):
    assert history(client)["total"] == 0
    created = client.post("/api/incidents", json=INCIDENT)
    assert created.status_code == 201
    incident_id = created.json()["id"]
    edited = client.patch(f"/api/incidents/{incident_id}", json={
        "status": "closed", "description": "MORE SECRET TEST NOTE",
    })
    assert edited.status_code == 200
    # No-op writes must not produce a misleading change event.
    assert client.patch(f"/api/incidents/{incident_id}", json={"status": "closed"}).status_code == 200
    imported = client.post("/api/incidents/import", files={"file": (
        "test.json", json.dumps([INCIDENT, INCIDENT]), "application/json",
    )})
    assert imported.status_code == 201
    assert client.delete(f"/api/incidents/{incident_id}").status_code == 204

    result = history(client)
    assert result["total"] == 4
    assert [row["action"] for row in result["items"]] == [
        "incident.deleted", "incident.imported", "incident.updated", "incident.created",
    ]
    assert all(row["actor_username"] == "testadmin" for row in result["items"])
    assert all(row["actor_role"] == "admin" for row in result["items"])
    assert all(row["actor_id"] for row in result["items"])
    assert all(row["occurred_at"].endswith("Z") for row in result["items"])
    assert result["items"][0]["entity_id"] == incident_id
    assert result["items"][1]["details"] == {"record_count": 2}
    assert result["items"][2]["details"] == {
        "description_changed": True, "status_before": "reported", "status_after": "closed",
    }
    assert "MUST NOT BE LOGGED" not in json.dumps(result)
    assert "MORE SECRET" not in json.dumps(result)
    filtered = history(client, entity_type="incident", limit=1, offset=1)
    assert filtered["total"] == 3 and len(filtered["items"]) == 1
    assert filtered["items"][0]["action"] == "incident.updated"
    assert history(client, actor_id="missing-actor")["total"] == 0
    assert client.get("/api/admin/audit", params={"limit": 101}).status_code == 422
    assert client.get("/api/admin/audit", params={"entity_type": "unknown"}).status_code == 422


def test_failed_changes_do_not_create_events(client):
    assert client.post("/api/incidents", json={}).status_code == 422
    assert client.delete("/api/incidents/no-such-id").status_code == 404
    created = client.post("/api/incidents", json=INCIDENT).json()
    initial = history(client)["total"]
    assert client.patch(f"/api/incidents/{created['id']}", json={"status": None}).status_code == 422
    bad_import = client.post("/api/incidents/import", files={"file": (
        "bad.json", json.dumps([INCIDENT, {"category": "Invalid"}]), "application/json",
    )})
    assert bad_import.status_code == 422
    assert history(client)["total"] == initial


def test_prevention_create_and_update_without_recording_notes_or_owner(client):
    assert client.post("/api/incidents", json=INCIDENT).status_code == 201
    created = client.post("/api/prevention/plans", json={
        "zone": "Demo Zone A", "category": "Theft",
        "action_code": "property-awareness",
        "owner": "Sensitive test coordinator", "notes": "Secret planning notes",
    })
    assert created.status_code == 201, created.text
    plan_id = created.json()["id"]
    edited = client.patch(f"/api/prevention/plans/{plan_id}", json={
        "status": "in_progress", "owner": "Another coordinator",
        "notes": "Confidential example notes", "due_date": "2026-11-12",
    })
    assert edited.status_code == 200, edited.text
    assert client.patch(f"/api/prevention/plans/{plan_id}", json={
        "status": "in_progress",
    }).status_code == 200
    assert client.patch(f"/api/prevention/plans/{plan_id}", json={
        "status": "proposed",
    }).status_code == 422

    result = history(client, entity_type="prevention_plan")
    assert [row["action"] for row in result["items"]] == [
        "prevention_plan.updated", "prevention_plan.created",
    ]
    assert result["total"] == 2
    assert all(row["entity_id"] == plan_id for row in result["items"])
    assert result["items"][0]["details"] == {
        "status_before": "proposed", "status_after": "in_progress",
        "owner_changed": True, "notes_changed": True,
        "due_date_before": None, "due_date_after": "2026-11-12",
    }
    assert "Secret planning" not in json.dumps(result)
    assert "Sensitive test coordinator" not in json.dumps(result)
    assert "Another coordinator" not in json.dumps(result)
    assert "Confidential example" not in json.dumps(result)


def test_audit_history_is_admin_only(client):
    for role in ("viewer", "analyst", "officer"):
        created = client.post("/api/admin/users", json={
            "username": f"audit{role}", "password": "strong-test-password-example", "role": role,
        })
        assert created.status_code == 201
    client.cookies.delete(COOKIE)
    assert client.get("/api/admin/audit").status_code == 401
    for role in ("viewer", "analyst", "officer"):
        client.cookies.delete(COOKIE)
        login = client.post("/api/auth/login", json={
            "username": f"audit{role}", "password": "strong-test-password-example",
        })
        assert login.status_code == 200
        assert client.get("/api/admin/audit").status_code == 403


def test_change_and_audit_share_one_database_transaction(client):
    # Exercise the shared unit of work, including the rollback case.
    with Session(main_module.engine) as db:
        admin = db.scalar(select(User).where(User.username == "testadmin"))
        incident = Incident(
            id="ATOMIC-TEST-ID", category="Other", occurred_at="2026-09-12T00:00:00Z",
            latitude=11.935, longitude=79.83, police_station=None,
            description="Will be rolled back", status="reported", source_type="synthetic",
        )
        db.add(incident)
        record_event(db, admin, "incident.created", "incident", incident.id, {"category": "Other"})
        db.flush()
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 1
        assert db.get(Incident, incident.id) is not None
        db.rollback()
    with Session(main_module.engine) as db:
        assert db.get(Incident, "ATOMIC-TEST-ID") is None
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 0
