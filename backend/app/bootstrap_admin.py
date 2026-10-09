"""Initialize the first local administrator; no default credentials are shipped.

Usage (from backend/): python -m app.bootstrap_admin
"""
import getpass
import sys
from sqlalchemy import select

from . import auth_models  # register account tables
from .auth import create_user
from .auth_models import User
from .db import Base, SessionLocal, engine


def main():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            print("Accounts already exist. Sign in as an administrator to create/manage accounts.")
            return 1
        try:
            username = input("Administrator username: ").strip()
            password = getpass.getpass("Administrator password (12–128 characters): ")
            confirm = getpass.getpass("Confirm password: ")
        except (KeyboardInterrupt, EOFError):
            print("\nCancelled.")
            return 1
        if password != confirm:
            print("Passwords do not match.")
            return 1
        try:
            create_user(db, username, password, "admin")
        except Exception as exc:
            print(f"Account not created: {exc}")
            return 1
    print("Administrator account created. Sign in through the CrimeMap web app.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
