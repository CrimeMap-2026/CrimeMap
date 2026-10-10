"""Read-only before/after count comparison for one saved completed demo plan.

This is explicitly *not* a causal impact or effectiveness evaluation.
Both periods use the existing prevention incident filters in IST.
"""
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import require_permission
from .db import get_db
from .prevention import MISSING_ZONE, incident_query
from .prevention_models import PreventionPlan
from .schemas import Category

router = APIRouter(prefix="/api/prevention", tags=["synthetic-prevention"],
                   dependencies=[Depends(require_permission("analyze"))])

LIMITATIONS = [
    "Counts represent fictional demonstration records and do not measure real-world prevention.",
    "The comparison windows are manually chosen and are not automatically tied to the plan's "
    "actual implementation or completion time.",
    "No control group, exposure adjustment, reporting-rate correction or statistical "
    "significance test is used. Changes cannot be attributed to the plan.",
    "Zero recorded incidents does not mean zero incidents occurred or that a zone is safe.",
]


class ReviewCounts(BaseModel):
    source_type: Literal["synthetic"] = "synthetic"
    data_label: str = "SYNTHETIC DEMONSTRATION DATA"
    method: Literal["equal_duration_plan_count_review"] = "equal_duration_plan_count_review"
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    plan_id: str
    plan_title: str
    plan_status: Literal["completed"] = "completed"
    zone: str
    zone_label: str
    category: str
    previous_start_date: date
    previous_end_date: date
    followup_start_date: date
    followup_end_date: date
    days_per_period: int
    previous_count: int
    followup_count: int
    absolute_change: int
    percent_change: float | None
    methodology: str = (
        "Equal-length non-overlapping inclusive IST date windows; count synthetic incidents "
        "matching the saved plan's zone and category using the same query and date boundaries "
        "as Prevention Planner. No estimated risk or intervention impact."
    )
    limitations: list[str]


@router.get("/plans/{plan_id}/review", response_model=ReviewCounts)
def review_plan_counts(
    plan_id: str,
    db: Annotated[Session, Depends(get_db)],
    previous_start_date: date,
    previous_end_date: date,
    followup_start_date: date,
    followup_end_date: date,
):
    plan = db.get(PreventionPlan, plan_id)
    if plan is None:
        raise HTTPException(404, "Prevention action plan not found")
    if plan.status != "completed":
        raise HTTPException(422, "Only completed action plans can be reviewed")

    if previous_start_date > previous_end_date or followup_start_date > followup_end_date:
        raise HTTPException(422, "Each period must start on or before its end date")
    if previous_end_date >= followup_start_date:
        raise HTTPException(422, "Comparison periods must be ordered and must not overlap")
    previous_days = (previous_end_date - previous_start_date).days + 1
    followup_days = (followup_end_date - followup_start_date).days + 1
    if previous_days != followup_days or previous_days > 366:
        raise HTTPException(422, "Choose equally long periods of at most 366 days")

    category = Category(plan.category)
    def count_between(start: date, end: date) -> int:
        query = incident_query(plan.zone, category, start, end).subquery()
        return db.scalar(select(func.count()).select_from(query)) or 0

    previous = count_between(previous_start_date, previous_end_date)
    followup = count_between(followup_start_date, followup_end_date)
    return ReviewCounts(
        plan_id=plan.id, plan_title=plan.title,
        zone=plan.zone,
        zone_label="Unspecified zone" if plan.zone == MISSING_ZONE else plan.zone,
        category=plan.category,
        previous_start_date=previous_start_date,
        previous_end_date=previous_end_date,
        followup_start_date=followup_start_date,
        followup_end_date=followup_end_date,
        days_per_period=previous_days,
        previous_count=previous,
        followup_count=followup,
        absolute_change=followup - previous,
        percent_change=round((followup - previous) / previous * 100, 1)
            if previous else None,
        limitations=LIMITATIONS,
    )
