"""Evidence-grounded, role-protected demonstration prevention planner tests."""
from app.auth import COOKIE


def insert(client, category="Theft", zone="Demo Zone A", when="2026-09-12T18:00:00+05:30"):
    return client.post("/api/incidents", json={
        "category": category, "occurred_at": when, "latitude": 11.932,
        "longitude": 79.830, "police_station": zone,
        "description": "SYNTHETIC DEMO only", "status": "reported",
    })


def sample(client):
    for _ in range(3):
        assert insert(client).status_code == 201
    assert insert(client, "Cybercrime", "Demo Zone B").status_code == 201
    assert insert(client, "Theft", "Demo Zone A", "2026-07-12T14:00:00+05:30").status_code == 201


def test_insights_are_grouped_and_explainable(client):
    sample(client)
    response = client.get("/api/prevention/insights")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["source_type"] == "synthetic"
    assert payload["total_matching_incidents"] == 5
    assert payload["group_count"] == 2
    top = payload["observations"][0]
    assert top["zone"] == "Demo Zone A"
    assert top["category"] == "Theft"
    assert top["count"] == 4
    assert top["share_percent"] == 80.0
    assert len(top["actions"]) == 2
    assert "not forecasts" in payload["methodology"].lower()


def test_date_zone_category_filters_and_empty_result(client):
    sample(client)
    good = client.get("/api/prevention/insights", params={
        "zone": "Demo Zone A", "category": "Theft",
        "start_date": "2026-09-01", "end_date": "2026-09-30",
    })
    assert good.status_code == 200, good.text
    assert good.json()["total_matching_incidents"] == 3
    assert good.json()["observations"][0]["count"] == 3
    none = client.get("/api/prevention/insights", params={"zone": "Demo Zone C"})
    assert none.status_code == 200
    assert none.json()["observations"] == []
    assert client.get("/api/prevention/insights", params={
        "start_date": "2026-10-01", "end_date": "2026-01-01",
    }).status_code == 422


def test_create_plan_snapshots_server_evidence_and_tracks_status(client):
    sample(client)
    body = {
        "zone": "Demo Zone A", "category": "Theft",
        "action_code": "property-awareness",
        "owner": "Example outreach coordinator", "due_date": "2026-11-30",
        "start_date": "2026-09-01", "end_date": "2026-09-30",
        "notes": "Synthetic-only draft, review with local partners",
    }
    created = client.post("/api/prevention/plans", json=body)
    assert created.status_code == 201, created.text
    plan = created.json()
    assert plan["status"] == "proposed"
    assert plan["evidence_count"] == 3
    assert "3 synthetic" in plan["rationale"]
    assert plan["source_type"] == "synthetic"
    assert plan["owner"] == body["owner"]
    assert len(client.get("/api/prevention/plans").json()) == 1
    first = client.patch("/api/prevention/plans/" + plan["id"], json={"status": "in_progress"})
    assert first.status_code == 200, first.text
    finish = client.patch("/api/prevention/plans/" + plan["id"], json={
        "status": "completed", "notes": "Fictional sessions recorded",
    })
    assert finish.status_code == 200
    assert finish.json()["status"] == "completed"
    assert finish.json()["notes"] == "Fictional sessions recorded"
    assert client.patch("/api/prevention/plans/" + plan["id"], json={
        "status": "proposed",
    }).status_code == 422


def test_bad_action_and_no_evidence_rejected(client):
    sample(client)
    payload = {"zone": "Demo Zone A", "category": "Theft",
               "action_code": "digital-literacy", "owner": "Demo analyst"}
    assert client.post("/api/prevention/plans", json=payload).status_code == 422
    payload["action_code"] = "property-awareness"
    payload["zone"] = "Demo Zone C"
    assert client.post("/api/prevention/plans", json=payload).status_code == 422
    assert client.get("/api/prevention/plans").json() == []


def test_plan_status_null_update_unknown_ids_and_owner_validation(client):
    sample(client)
    new = client.post("/api/prevention/plans", json={
        "zone": "Demo Zone A", "category": "Theft",
        "action_code": "property-awareness", "owner": "Development officer",
    }).json()
    identifier = new["id"]
    assert client.patch(f"/api/prevention/plans/{identifier}", json={"status": None}).status_code == 422
    assert client.patch(f"/api/prevention/plans/{identifier}", json={"owner": None}).status_code == 422
    assert client.patch(f"/api/prevention/plans/{identifier}", json={}).status_code == 422
    assert client.patch(f"/api/prevention/plans/{identifier}", json={"status": "completed"}).status_code == 422
    assert client.patch("/api/prevention/plans/nonexistent", json={"status": "cancelled"}).status_code == 404
    assert client.patch(f"/api/prevention/plans/{identifier}", json={"status": "cancelled"}).status_code == 200
    assert client.patch(f"/api/prevention/plans/{identifier}", json={"status": "in_progress"}).status_code == 422


def test_role_enforcement_for_analyst_officer_and_viewer(client):
    sample(client)
    def login_role(role):
        username = "example_" + role
        assert client.post("/api/admin/users", json={
            "username": username, "password": "strong-demo-password-only", "role": role,
        }).status_code == 201
        return username

    usernames = {role: login_role(role) for role in ("viewer", "analyst", "officer")}
    client.cookies.delete(COOKIE)
    assert client.get("/api/prevention/insights").status_code == 401
    assert client.get("/api/prevention/plans").status_code == 401
    assert client.post("/api/prevention/plans", json={}).status_code == 401

    def sign_in(name):
        client.cookies.delete(COOKIE)
        result = client.post("/api/auth/login", json={
            "username": name, "password": "strong-demo-password-only",
        })
        assert result.status_code == 200, result.text

    sign_in(usernames["viewer"])
    assert client.get("/api/prevention/insights").status_code == 403
    assert client.get("/api/prevention/plans").status_code == 403
    sign_in(usernames["analyst"])
    assert client.get("/api/prevention/insights").status_code == 200
    assert client.get("/api/prevention/plans").status_code == 200
    payload = {"zone": "Demo Zone A", "category": "Theft",
               "action_code": "property-awareness", "owner": "Sample coordinator"}
    assert client.post("/api/prevention/plans", json=payload).status_code == 403
    sign_in(usernames["officer"])
    created = client.post("/api/prevention/plans", json=payload)
    assert created.status_code == 201, created.text
    assert client.patch("/api/prevention/plans/" + created.json()["id"],
                        json={"status": "in_progress"}).status_code == 200


def test_missing_zone_is_separate_from_literal_name(client):
    assert insert(client, "Theft", None).status_code == 201
    assert insert(client, "Theft", "Unspecified zone").status_code == 201
    missing = client.get("/api/prevention/insights", params={"zone": "__unspecified__"})
    named = client.get("/api/prevention/insights", params={"zone": "Unspecified zone"})
    assert missing.status_code == named.status_code == 200
    assert missing.json()["total_matching_incidents"] == 1
    assert named.json()["total_matching_incidents"] == 1
    assert missing.json()["observations"][0]["zone"] == "__unspecified__"
    assert named.json()["observations"][0]["zone"] == "Unspecified zone"
