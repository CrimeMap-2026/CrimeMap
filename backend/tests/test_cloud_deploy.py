"""Cloud Run readiness without touching a real Cloud SQL instance or developer DB."""
import os
from pathlib import Path
import subprocess
import sys

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import COOKIE, check_request_origin, login
from app.db import Base

BACKEND = Path(__file__).resolve().parents[1]


def run_python(snippet, *, extra_env=None):
    env = dict(os.environ)
    env.pop("CRIMEMAP_DEPLOYMENT", None)
    env.pop("DATABASE_URL", None)
    env.pop("CRIMEMAP_STATIC_DIR", None)
    env.pop("DB_PASS", None)
    env.pop("DB_NAME", None)
    env.pop("DB_USER", None)
    env.pop("CLOUD_SQL_CONNECTION_NAME", None)
    env.update(extra_env or {})
    return subprocess.run(
        [sys.executable, "-c", snippet],
        cwd=BACKEND, env=env, capture_output=True, text=True,
        check=False, timeout=15,
    )


def test_cloud_run_fails_closed_without_cloudsql_configuration():
    result = run_python("import app.db", extra_env={"CRIMEMAP_DEPLOYMENT": "cloud-run"})
    assert result.returncode != 0
    assert "Cloud deployment is missing required Cloud SQL settings" in result.stderr
    assert "sqlite" not in result.stdout.lower()


def test_cloudsql_socket_configuration_does_not_escape_special_password_characters():
    env = {
        "CRIMEMAP_DEPLOYMENT": "cloud-run",
        "CLOUD_SQL_CONNECTION_NAME": "sample-proj:asia-south1:crimemap-db",
        "DB_NAME": "crimemap", "DB_USER": "crimemap_app",
        "DB_PASS": "a:b@/secret!with%chars",
    }
    result = run_python(
        "from app.db import engine; "
        "assert engine.url.drivername == 'postgresql+psycopg'; "
        "assert engine.url.password == 'a:b@/secret!with%chars'; "
        "assert engine.url.query['host'] == '/cloudsql/sample-proj:asia-south1:crimemap-db'; "
        "assert engine.url.database == 'crimemap'; "
        "print('Cloud SQL socket: ready, no connection requested')",
        extra_env=env,
    )
    assert result.returncode == 0, result.stderr
    assert "Cloud SQL socket: ready" in result.stdout
    assert env["DB_PASS"] not in result.stdout


def test_static_mount_serves_frontend_without_breaking_api_or_health(tmp_path):
    static = tmp_path / "dist"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>CRIMEMAP-TEST-INDEX</html>")
    (static / "assets" / "app.js").write_text("console.log('demo');")
    database = (tmp_path / "test.db").as_posix()
    result = run_python(
        "from fastapi.testclient import TestClient; from app.main import app; "
        "client=TestClient(app); "
        "assert client.get('/').status_code == 200; "
        "assert 'CRIMEMAP-TEST-INDEX' in client.get('/').text; "
        "assert client.get('/assets/app.js').status_code == 200; "
        "assert client.get('/health').json()['status'] == 'ok'; "
        "assert client.get('/api/incidents').status_code == 401; "
        "print('one origin serves React and protected FastAPI')",
        extra_env={
            "CRIMEMAP_STATIC_DIR": str(static),
            "DATABASE_URL": "sqlite:///" + database,
        },
    )
    assert result.returncode == 0, result.stderr
    assert "one origin" in result.stdout


def make_request(origin, *, host="crimemap-xyz.a.run.app", scheme="http"):
    return Request({
        "type": "http", "method": "POST", "scheme": scheme, "path": "/api/auth/login",
        "headers": [
            (b"host", host.encode("ascii")),
            (b"origin", origin.encode("ascii")),
        ],
    })


def test_cloud_run_accepts_matching_https_and_rejects_http_and_mismatched_origin(monkeypatch):
    monkeypatch.setenv("CRIMEMAP_DEPLOYMENT", "cloud-run")
    check_request_origin(make_request("https://crimemap-xyz.a.run.app"))
    for origin in [
        "http://crimemap-xyz.a.run.app", "https://evil.example",
        "http://localhost:5173", "https://crimemap-xyz.a.run.app.evil.example",
    ]:
        with pytest.raises(HTTPException) as exc:
            check_request_origin(make_request(origin))
        assert exc.value.status_code == 403


def test_cloud_mode_requires_built_frontend():
    result = run_python(
        "import app.main",
        extra_env={
            "CRIMEMAP_DEPLOYMENT": "cloud-run",
            "DB_USER": "demo", "DB_NAME": "demo",
            "DB_PASS": "test", "CLOUD_SQL_CONNECTION_NAME": "x:y:z",
        },
    )
    assert result.returncode != 0
    assert "CRIMEMAP_STATIC_DIR" in result.stderr
