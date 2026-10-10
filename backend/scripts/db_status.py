"""Inspect the configured CrimeMap database without changing it or printing secrets.

Run from backend/: python -m scripts.db_status
"""
import sys

from sqlalchemy import func, inspect, select
from sqlalchemy.exc import SQLAlchemyError

from app.db import engine
from app.models import Incident
from app.auth_models import User, LoginSession
from app.prevention_models import PreventionPlan


def main() -> int:
    print(f"Configured database: {engine.dialect.name}")
    print(f"Connection (password hidden): {engine.url.render_as_string(hide_password=True)}")
    try:
        with engine.connect() as connection:
            tables = set(inspect(connection).get_table_names())
            for name, model in (("incidents", Incident), ("users", User), ("login_sessions", LoginSession), ("prevention_plans", PreventionPlan)):
                if name in tables:
                    total = connection.execute(select(func.count()).select_from(model)).scalar_one()
                    print(f"  {name}: {total:,} rows")
                else:
                    print(f"  {name}: table not initialized")
    except SQLAlchemyError as exc:
        print(f"Database connection failed ({type(exc).__name__}). Check DATABASE_URL and server status.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
