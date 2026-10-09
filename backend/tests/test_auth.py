"""RBAC regression tests: backend enforcement, not merely hidden frontend controls."""
from app.auth import COOKIE


def switch_to_role(client, role):
    password = "test-role-password-strong"
    result = client.post("/api/admin/users", json={
        "username": f"role_{role}", "password": password, "role": role,
    })
    assert result.status_code == 201, result.text
    user = result.json()
    client.cookies.delete(COOKIE)
    auth = client.post("/api/auth/login", json={"username": f"role_{role}", "password": password})
    assert auth.status_code == 200, auth.text
    assert auth.json()["role"] == role
    return user


def test_all_sensitive_endpoints_require_login(client):
    client.cookies.delete(COOKIE)
    for uri in ("/api/incidents", "/api/map/incidents?south=11&west=79&north=12&east=80",
                "/api/analytics/overview", "/api/analytics/filters",
                "/api/hotspots/grid", "/api/operations/overview", "/api/admin/users", "/api/auth/me"):
        result = client.get(uri)
        assert result.status_code == 401, (uri, result.text)
    assert client.post("/api/incidents", json={}).status_code == 401
    assert client.get("/health").status_code == 200


def test_viewer_can_read_but_cannot_analyze_or_write(client):
    switch_to_role(client, "viewer")
    assert client.get("/api/incidents").status_code == 200
    assert client.get("/api/map/incidents?south=11&west=79&north=12&east=80").status_code == 200
    assert client.get("/api/operations/overview").status_code == 200
    assert client.get("/api/analytics/overview").status_code == 403
    assert client.get("/api/hotspots/grid").status_code == 403
    assert client.post("/api/incidents", json={}).status_code == 403
    assert client.get("/api/admin/users").status_code == 403


def test_analyst_reads_analysis_but_cannot_mutate(client):
    switch_to_role(client, "analyst")
    assert client.get("/api/analytics/overview").status_code == 200
    assert client.get("/api/analytics/filters").status_code == 200
    assert client.get("/api/hotspots/grid").status_code == 200
    assert client.post("/api/incidents", json={}).status_code == 403
    assert client.post("/api/incidents/import").status_code == 403
    assert client.delete("/api/incidents/no-such-record").status_code == 403
    assert client.get("/api/admin/users").status_code == 403


def test_officer_can_create_and_update_but_not_delete(client):
    switch_to_role(client, "officer")
    item = {
        "category": "Theft", "occurred_at": "2026-09-20T15:00:00+05:30",
        "latitude": 11.9345, "longitude": 79.8302, "status": "reported",
    }
    created = client.post("/api/incidents", json=item)
    assert created.status_code == 201, created.text
    identifier = created.json()["id"]
    assert client.patch(f"/api/incidents/{identifier}", json={"status": "closed"}).status_code == 200
    assert client.delete(f"/api/incidents/{identifier}").status_code == 403
    assert client.get("/api/analytics/overview").status_code == 200
    assert client.get("/api/admin/users").status_code == 403


def test_admin_can_manage_users_and_role_change_revokes_sessions(client):
    created = client.post("/api/admin/users", json={
        "username": "another_user", "password": "long-demo-password-example", "role": "viewer",
    })
    assert created.status_code == 201
    user_id = created.json()["id"]
    duplicate = client.post("/api/admin/users", json={
        "username": "another_user", "password": "long-demo-password-example",
    })
    assert duplicate.status_code == 409
    bad_pw = client.post("/api/admin/users", json={"username": "shortuser", "password": "short"})
    assert bad_pw.status_code == 422

    client.cookies.delete(COOKIE)
    assert client.post("/api/auth/login", json={
        "username": "another_user", "password": "long-demo-password-example",
    }).status_code == 200
    assert client.get("/api/auth/me").json()["role"] == "viewer"

    # Restore admin session via credentials then change user role; their token must stop working.
    client.cookies.delete(COOKIE)
    assert client.post("/api/auth/login", json={
        "username": "testadmin", "password": "unit-test-password-strong",
    }).status_code == 200
    assert client.patch(f"/api/admin/users/{user_id}", json={"role": "analyst"}).status_code == 200
    client.cookies.delete(COOKIE)
    assert client.post("/api/auth/login", json={
        "username": "another_user", "password": "long-demo-password-example",
    }).json()["role"] == "analyst"


def test_self_admin_demotion_blocked_and_logout_revokes(client):
    admin = client.get("/api/auth/me").json()
    assert client.patch(f"/api/admin/users/{admin['id']}", json={"role": "viewer"}).status_code == 403
    assert client.patch(f"/api/admin/users/{admin['id']}", json={"is_active": False}).status_code == 403
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_password_change_revokes_session(client):
    response = client.post("/api/auth/change-password", json={
        "current_password": "unit-test-password-strong",
        "new_password": "new-test-password-strong",
    })
    assert response.status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={
        "username": "testadmin", "password": "new-test-password-strong",
    }).status_code == 200


def test_cookie_auth_rejects_cross_site_writes(client):
    payload = {"username": "blockeduser", "password": "long-demo-password-example", "role": "viewer"}
    assert client.post("/api/admin/users", json=payload,
                       headers={"Origin": "https://unrelated.example"}).status_code == 403


def test_disabled_accounts_cannot_sign_in(client):
    created = client.post("/api/admin/users", json={
        "username": "disabled_user", "password": "long-demo-password-example",
    })
    assert created.status_code == 201
    assert client.patch("/api/admin/users/" + created.json()["id"],
                        json={"is_active": False}).status_code == 200
    client.cookies.delete(COOKIE)
    assert client.post("/api/auth/login", json={
        "username": "disabled_user", "password": "long-demo-password-example",
    }).status_code == 401
