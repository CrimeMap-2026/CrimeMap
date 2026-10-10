"""One-time explicit Cloud SQL database initialization for a *new* demo project.

Intended for a restricted Cloud Run Job, not the web service's startup.
Reads initial admin password from Secret Manager-injected environment and does
not write, log or echo it. Never changes an existing user/password/incident.
"""
import argparse
import os
import sys

from sqlalchemy import select

from app.auth import create_user
from app.auth_models import User
from app.db import Base, SessionLocal, engine
import app.main  # noqa: F401 — imports/registers the full application's SQL models
from scripts.seed_demo import main as seed_demo


def initialize(*, seed: bool = False) -> None:
    if os.getenv("CRIMEMAP_DEPLOYMENT") != "cloud-run":
        raise RuntimeError("Cloud initializer must run with CRIMEMAP_DEPLOYMENT=cloud-run")
    username = os.getenv("CRIMEMAP_INITIAL_ADMIN_USERNAME", "").strip()
    password = os.getenv("CRIMEMAP_INITIAL_ADMIN_PASSWORD", "")
    if not username or not password:
        raise RuntimeError(
            "Provide CRIMEMAP_INITIAL_ADMIN_USERNAME and "
            "CRIMEMAP_INITIAL_ADMIN_PASSWORD via a restricted Cloud Run Job"
        )
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            print("Existing user found; administrator bootstrap skipped.")
        else:
            create_user(db, username, password, "admin")
            print("Initial demonstration administrator created.")

    if seed:
        # Only canonical missing DEMO IDs are inserted. No records overwritten.
        seed_demo()
    else:
        print("No incidents seeded (pass --seed to explicitly add demo fixtures).")


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize a new synthetic Cloud SQL database")
    parser.add_argument("--seed", action="store_true",
                        help="Insert only missing 100 canonical fictional demo incidents")
    arguments = parser.parse_args()
    initialize(seed=arguments.seed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
