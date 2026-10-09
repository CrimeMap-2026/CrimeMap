import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.auth import COOKIE, create_user, issue_session
from app.main import app
import app.main as main_module


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=test_engine)
    # App lifespan must use the test database too, never the developer's file.
    monkeypatch.setattr(main_module, "engine", test_engine)

    def override_db():
        with Session(test_engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    # Old functional tests exercise the application as a signed-in administrator.
    # Separate RBAC tests below explicitly remove/swap this cookie to assert 401/403.
    with Session(test_engine) as session:
        user = create_user(session, "testadmin", "unit-test-password-strong", "admin")
        token = issue_session(session, user)
    with TestClient(app) as test_client:
        test_client.cookies.set(COOKIE, token)
        yield test_client
    app.dependency_overrides.clear()
    test_engine.dispose()
