"""Authenticated on-demand presentation export using existing aggregate modules."""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import overview, zone_expression
from .auth import require_permission
from .db import get_db
from .hotspots import grid
from .models import Incident
from .presentation_pdf import make_report_pdf
from .prevention import MISSING_ZONE
from .prevention_models import PreventionPlan
from .schemas import Category, Status

router = APIRouter(prefix="/api/reports", tags=["reports"],
                   dependencies=[Depends(require_permission("analyze"))])
ALLOWED = ("analytics", "spatial", "prevention")


def parse_sections(sections: str) -> list[str]:
    requested = [part.strip() for part in sections.split(",")]
    if not requested or any(part not in ALLOWED for part in requested):
        raise HTTPException(422, "Select one or more valid report sections")
    # Keep output page order consistent and never duplicate a section.
    return [section for section in ALLOWED if section in requested]


@router.get("/presentation", response_class=Response)
def presentation(
    db: Annotated[Session, Depends(get_db)],
    start_date: date | None = None,
    end_date: date | None = None,
    category: Category | None = None,
    status: Status | None = None,
    zone: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    unspecified_zone: bool = False,
    sections: Annotated[str, Query(max_length=70)] = "analytics,spatial,prevention",
    cell_size_m: Annotated[int, Query(ge=250, le=5000)] = 1000,
    min_count: Annotated[int, Query(ge=2, le=1000)] = 2,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date")
    if zone is not None and (unspecified_zone or not zone.strip()):
        raise HTTPException(422, "Choose a named zone or unspecified_zone, not both")

    chosen = parse_sections(sections)
    common = {
        "start_date": start_date, "end_date": end_date,
        "category": category, "status": status,
        "zone": zone, "unspecified_zone": unspecified_zone,
    }
    analytics = overview(db, **common) if "analytics" in chosen else None
    spatial = grid(db, **common, cell_size_m=cell_size_m, min_count=min_count) \
        if "spatial" in chosen else None
    plans = None
    total_plans = 0
    if "prevention" in chosen:
        condition = []
        if category is not None:
            condition.append(PreventionPlan.category == category.value)
        if zone is not None:
            condition.append(PreventionPlan.zone == zone.strip())
        if unspecified_zone:
            condition.append(PreventionPlan.zone == MISSING_ZONE)
        query = select(PreventionPlan).where(*condition)
        total_plans = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        plans = db.scalars(query.order_by(
            PreventionPlan.created_at.desc(), PreventionPlan.id
        ).limit(12)).all()

    params = {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "category": category.value if category is not None else None,
        "status": status.value if status is not None else None,
        "zone_label": "Unspecified zone" if unspecified_zone else zone,
    }
    pdf = make_report_pdf(
        analytics=analytics, spatial=spatial, plans=plans,
        total_plan_count=total_plans, filters=params, sections=chosen,
        cell_size_m=cell_size_m, min_count=min_count,
    )
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="crimemap-synthetic-presentation.pdf"',
                 "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"},
    )
