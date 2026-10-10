"""Explainable prevention suggestions and action tracking for fictional incidents.

Descriptive counts only. No prediction, risk scores, patrol dispatch or claims
about real Puducherry locations. Recommendations are general safeguarding ideas
requiring human review, feasibility checks and appropriate authorization.
"""
from datetime import date, datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import utc_boundary, zone_expression
from .audit import record_event
from .auth import User, current_user, require_permission
from .db import get_db
from .models import Incident
from .prevention_models import PreventionPlan
from .schemas import Category

router = APIRouter(prefix="/api/prevention", tags=["synthetic-prevention"])
SYNTHETIC = "SYNTHETIC DEMONSTRATION DATA"
MISSING_ZONE = "__unspecified__"

# All interventions are generic, non-coercive and subject to human approval.
LIBRARY = {
    "Theft": (
        ("property-awareness", "Property security awareness", "Share practical advice on securing valuables, reporting theft, and protecting personal belongings.", "Number of awareness activities documented"),
        ("environment-review", "Public-space maintenance review", "Request a voluntary review of lighting, visibility and reported maintenance issues in shared spaces.", "Number of maintenance issues assessed"),
    ),
    "Vehicle Theft": (
        ("vehicle-security", "Vehicle security outreach", "Share parking-lock, key-control and anti-theft reminders with residents and vehicle owners.", "Number of vehicle security materials shared"),
        ("parking-review", "Parking facility safety review", "Engage facility owners about lighting, access and clear reporting channels.", "Number of parking facilities assessed"),
    ),
    "Burglary": (
        ("home-security", "Home and premises security workshops", "Offer opt-in information on locks, entry-point maintenance and trusted incident reporting.", "Number of workshops or information sessions"),
        ("neighbourhood-outreach", "Neighbourhood prevention partnerships", "Invite local groups to discuss safe reporting and practical property-protection resources.", "Number of community meetings"),
    ),
    "Robbery": (
        ("public-awareness", "Personal safety information", "Publish clear, non-alarmist advice on safer public-space practices and confidential reporting.", "Number of outreach activities"),
        ("accessibility-audit", "Shared-space visibility and access audit", "Recommend an accessibility, lighting and line-of-sight review with responsible site owners.", "Number of environmental issues addressed"),
    ),
    "Assault": (
        ("support-services", "Victim support and referral awareness", "Promote accessible, trauma-informed support, reporting and referral information.", "Number of service information sessions"),
        ("deescalation", "Community de-escalation resources", "Coordinate voluntary conflict de-escalation and safe-intervention education with community partners.", "Number of training sessions offered"),
    ),
    "Cybercrime": (
        ("digital-literacy", "Cyber safety awareness campaign", "Share phishing, account protection, payment fraud and official cybercrime reporting guidance.", "Number of digital-literacy sessions"),
        ("fraud-reporting", "Fraud reporting guidance", "Provide verified information on preserving evidence and reaching legitimate reporting channels.", "Number of guidance materials distributed"),
    ),
    "Vandalism": (
        ("maintenance-partnership", "Public property maintenance partnership", "Arrange a review of lighting, repairs and reporting mechanisms with asset custodians.", "Number of repair or maintenance items reviewed"),
        ("youth-outreach", "Voluntary community stewardship programme", "Offer inclusive public-space stewardship activities and non-stigmatizing community education.", "Number of voluntary stewardship sessions"),
    ),
    "Other": (
        ("community-dialogue", "Community safety consultation", "Gather voluntary feedback on safety concerns, accessibility and trusted reporting channels.", "Number of consultation sessions"),
        ("referral-review", "Prevention service directory review", "Check the clarity of locally published support and reporting information.", "Number of verified directory updates"),
    ),
}
LOOKUP = {code: (category, title, detail, metric)
          for category, entries in LIBRARY.items()
          for code, title, detail, metric in entries}
PlanStatus = Literal["proposed", "in_progress", "completed", "cancelled"]


def zone_filter(query, zone: str | None):
    if zone is None:
        return query
    if zone == MISSING_ZONE:
        return query.where(zone_expression().is_(None))
    return query.where(zone_expression() == zone)


def incident_query(zone: str | None, category: Category | None,
                   start_date: date | None, end_date: date | None):
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(422, "From date must not be later than To date")
    query = select(Incident).where(Incident.source_type == "synthetic")
    query = zone_filter(query, zone)
    if category is not None:
        query = query.where(Incident.category == category.value)
    if start_date:
        query = query.where(Incident.occurred_at >= utc_boundary(start_date))
    if end_date:
        query = query.where(Incident.occurred_at <= utc_boundary(end_date, end=True))
    return query


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    zone: str = Field(min_length=1, max_length=120)
    category: Category
    action_code: str = Field(min_length=1, max_length=48)
    owner: str = Field(min_length=2, max_length=100)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    start_date: date | None = None
    end_date: date | None = None


class PlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: PlanStatus | None = None
    owner: str | None = Field(default=None, min_length=2, max_length=100)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    zone: str
    category: str
    action_code: str
    title: str
    rationale: str
    evidence_count: int
    status: str
    owner: str
    notes: str | None
    due_date: str | None
    created_by: str
    created_at: str
    updated_at: str
    source_type: Literal["synthetic"] = "synthetic"


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("/insights", dependencies=[Depends(require_permission("analyze"))])
def insights(
    db: Annotated[Session, Depends(get_db)],
    zone: Annotated[str | None, Query(max_length=120)] = None,
    category: Category | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    candidates = incident_query(zone, category, start_date, end_date).subquery()
    normalized_zone = func.coalesce(func.nullif(func.trim(candidates.c.police_station), ""), MISSING_ZONE)
    grouped = db.execute(
        select(normalized_zone.label("zone"), candidates.c.category,
               func.count(candidates.c.id).label("count"))
        .group_by(normalized_zone, candidates.c.category)
        .order_by(func.count(candidates.c.id).desc(), normalized_zone, candidates.c.category)
    ).all()
    total = sum(row.count for row in grouped)
    cards = []
    for row in grouped[:12]:
        actions = [
            {"code": code, "title": title, "description": description, "success_metric": metric}
            for code, title, description, metric in LIBRARY[row.category]
        ]
        cards.append({
            "zone": row.zone, "zone_label": "Unspecified zone" if row.zone == MISSING_ZONE else row.zone,
            "category": row.category, "count": row.count,
            "share_percent": round(100 * row.count / total, 1) if total else 0,
            "actions": actions,
        })
    return {
        "source_type": "synthetic", "data_label": SYNTHETIC,
        "total_matching_incidents": total, "group_count": len(grouped),
        "observations": cards,
        "filters": {
            "zone": zone, "category": category.value if category else None,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "methodology": (
            "Observed counts of fictional incidents grouped by demonstration zone and category. "
            "Higher counts reflect this synthetic dataset only: they are not forecasts, risk scores, "
            "causal findings, or evidence that an intervention will reduce crime. "
            "Recommendations are general options requiring human review and consultation."
        ),
    }


@router.get("/plans", response_model=list[PlanRead], dependencies=[Depends(require_permission("analyze"))])
def plans(db: Annotated[Session, Depends(get_db)]):
    return db.scalars(
        select(PreventionPlan).order_by(PreventionPlan.created_at.desc(), PreventionPlan.id).limit(200)
    ).all()


@router.post("/plans", response_model=PlanRead, status_code=201)
def create_plan(
    body: PlanCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("write"))],
):
    action = LOOKUP.get(body.action_code)
    if action is None or action[0] != body.category.value:
        raise HTTPException(422, "Select a prevention measure associated with the chosen category")
    if body.start_date and body.end_date and body.start_date > body.end_date:
        raise HTTPException(422, "Invalid evidence date range")
    matches = incident_query(body.zone, body.category, body.start_date, body.end_date).subquery()
    total = db.scalar(select(func.count()).select_from(matches)) or 0
    if total == 0:
        raise HTTPException(422, "No matching synthetic incidents remain for this observation")
    _, title, description, metric = action
    period = "all available dates"
    if body.start_date or body.end_date:
        period = f"{body.start_date or 'earliest'} to {body.end_date or 'latest'}"
    timestamp = utc_now()
    item = PreventionPlan(
        id=str(uuid4()), zone=body.zone, category=body.category.value,
        action_code=body.action_code, title=title,
        rationale=f"{total} synthetic {body.category.value} incidents in "
                  f"{'Unspecified zone' if body.zone == MISSING_ZONE else body.zone} "
                  f"({period}). Suggested indicator: {metric}. No claimed causal effect.",
        evidence_count=total, status="proposed", owner=body.owner,
        notes=body.notes, due_date=body.due_date.isoformat() if body.due_date else None,
        created_by=user.id, created_at=timestamp, updated_at=timestamp,
    )
    db.add(item)
    record_event(db, user, "prevention_plan.created", "prevention_plan", item.id, {
        "category": item.category, "status": item.status,
        "action_code": item.action_code, "evidence_count": item.evidence_count,
    })
    db.commit()
    db.refresh(item)
    return item


@router.patch("/plans/{plan_id}", response_model=PlanRead)
def update_plan(
    plan_id: str,
    body: PlanUpdate,
    db: Annotated[Session, Depends(get_db)],
    actor: Annotated[User, Depends(require_permission("write"))],
):
    item = db.get(PreventionPlan, plan_id)
    if item is None:
        raise HTTPException(404, "Action plan not found")
    changes = body.model_dump(exclude_unset=True)
    before = {
        "status": item.status, "owner": item.owner,
        "due_date": item.due_date, "notes": item.notes,
    }
    if not changes:
        raise HTTPException(422, "Specify a status, owner, due date or notes change")
    allowed = {
        "proposed": {"in_progress", "cancelled"},
        "in_progress": {"completed", "cancelled"},
        "completed": set(),
        "cancelled": set(),
    }
    if "status" in changes:
        status = changes["status"]
        if status is None:
            raise HTTPException(422, "Status cannot be null")
        if status != item.status and status not in allowed[item.status]:
            raise HTTPException(422, "Invalid action lifecycle transition")
        item.status = status
    if "owner" in changes:
        if changes["owner"] is None:
            raise HTTPException(422, "Owner cannot be null")
        item.owner = changes["owner"]
    if "due_date" in changes:
        item.due_date = changes["due_date"].isoformat() if changes["due_date"] else None
    if "notes" in changes:
        item.notes = changes["notes"]
    tracked = {}
    if before["status"] != item.status:
        tracked["status_before"] = before["status"]
        tracked["status_after"] = item.status
    if before["owner"] != item.owner:
        tracked["owner_changed"] = True
    if before["due_date"] != item.due_date:
        tracked["due_date_before"] = before["due_date"]
        tracked["due_date_after"] = item.due_date
    if before["notes"] != item.notes:
        # Notes may contain free text; record only that they were edited.
        tracked["notes_changed"] = True
    if tracked:
        item.updated_at = utc_now()
        record_event(db, actor, "prevention_plan.updated", "prevention_plan", item.id, tracked)
    db.commit()
    db.refresh(item)
    return item
