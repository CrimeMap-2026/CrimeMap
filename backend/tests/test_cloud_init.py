"""Cloud initialization is explicit and never rewrites an existing administrator."""
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import check_password
from app.auth_models import User
from app.db import Base
from scripts import cloud_init


def test_explicit_init_creates_only_one_user_and_does_not_change_existing_credentials(
    monkeypatch,
):
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(cloud_init, "engine", engine)
    monkeypatch.setattr(cloud_init, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setenv("CRIMEMAP_DEPLOYMENT", "cloud-run")
    monkeypatch.setenv("CRIMEMAP_INITIAL_ADMIN_USERNAME", "demo_admin")
    monkeypatch.setenv("CRIMEMAP_INITIAL_ADMIN_PASSWORD", "first-strong-test-password")

    cloud_init.initialize(seed=False)
    with Session(engine) as db:
        first = db.scalar(select(User))
        assert first is not None
        assert first.role == "admin"
        assert check_password("first-strong-test-password", first.password_hash)
        original_id, original_hash = first.id, first.password_hash

    # Re-running a job must never reset the administrator password.
    monkeypatch.setenv("CRIMEMAP_INITIAL_ADMIN_PASSWORD", "second-strong-test-password")
    cloud_init.initialize(seed=False)
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        current = db.scalar(select(User))
        assert current.id == original_id
        assert current.password_hash == original_hash
        assert not check_password("second-strong-test-password", current.password_hash)

    engine.dispose()


def test_cloud_initializer_rejects_local_mode_and_missing_credentials(monkeypatch):
    monkeypatch.delenv("CRIMEMAP_INITIAL_ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("CRIMEMAP_INITIAL_ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("CRIMEMAP_DEPLOYMENT", raising=False)
    with pytest.raises(RuntimeError, match="cloud-run"):
        cloud_init.initialize()
    monkeypatch.setenv("CRIMEMAP_DEPLOYMENT", "cloud-run")
    with pytest.raises(RuntimeError, match="CRIMEMAP_INITIAL_ADMIN_PASSWORD"):
        cloud_init.initialize()
