"""Shared SQLAlchemy incident filters for analytical and spatial endpoints."""
from datetime import date

from fastapi import HTTPException

from .analytics import utc_boundary, zone_expression
from .models import Incident
from .schemas import Category, Status


def incident_conditions(
    *, start_date: date | None = None, end_date: date | None = None,
    category: Category | None = None, status: Status | None = None,
    zone: str | None = None, unspecified_zone: bool = False,
):
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date")
    if zone is not None and (unspecified_zone or not zone.strip()):
        raise HTTPException(422, "Choose a named zone or unspecified_zone, not both")

    conditions = [Incident.source_type == "synthetic"]
    if start_date is not None:
        conditions.append(Incident.occurred_at >= utc_boundary(start_date))
    if end_date is not None:
        conditions.append(Incident.occurred_at <= utc_boundary(end_date, end=True))
    if category is not None:
        conditions.append(Incident.category == category.value)
    if status is not None:
        conditions.append(Incident.status == status.value)
    if zone is not None:
        conditions.append(zone_expression() == zone.strip())
    if unspecified_zone:
        conditions.append(zone_expression().is_(None))
    return conditions
