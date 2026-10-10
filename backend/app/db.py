"""Database setup for local SQLite/PostgreSQL and Cloud Run + Cloud SQL.

Cloud Run must never silently fall back to an ephemeral SQLite file.
"""
import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

CLOUD_RUN = os.getenv("CRIMEMAP_DEPLOYMENT") == "cloud-run"

if CLOUD_RUN:
    required = ("CLOUD_SQL_CONNECTION_NAME", "DB_NAME", "DB_USER", "DB_PASS")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(
            "Cloud deployment is missing required Cloud SQL settings: " +
            ", ".join(missing) +
            ". Configure Cloud SQL and Secret Manager before starting CrimeMap."
        )
    # URL.create handles punctuation in Secret Manager database passwords,
    # without putting credentials in the URL string or any source file.
    DATABASE_URL = URL.create(
        drivername="postgresql+psycopg",
        username=os.environ["DB_USER"],
        password=os.environ["DB_PASS"],
        database=os.environ["DB_NAME"],
        query={"host": "/cloudsql/" + os.environ["CLOUD_SQL_CONNECTION_NAME"]},
    )
    engine = create_engine(
        DATABASE_URL, pool_pre_ping=True, pool_size=3,
        max_overflow=2, pool_timeout=20, pool_recycle=1800,
    )
else:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./crimemap.db")
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
        if DATABASE_URL.startswith("sqlite") else {},
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
