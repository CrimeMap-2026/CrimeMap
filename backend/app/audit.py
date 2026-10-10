"""Write-only helper for transactional, allowlisted change events; admin read API."""
import json
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .audit_models import AuditEvent
from .auth import User, require_permission
from .db import get_db

router = APIRouter(prefix="/api/admin", tags=["audit"], dependencies=[Depends(require_permission("manage"))])
ENTITY_TYPES = ("incident", "prevention_plan", "incident_import")
ACTIONS = (
    "incident.created", "incident.updated", "incident.deleted", "incident.imported",
    "prevention_plan.created", "prevention_plan.updated",
)


def record_event(
    db: Session, actor: User, action: str, entity_type: str,
    entity_id: str | None = None, details: dict | None = None,
) -> None:
    """Add the event to the caller's pending transaction. NEVER commit here."""
    if action not in ACTIONS or entity_type not in ENTITY_TYPES:
        raise ValueError("Unknown audit event")
    if not actor or not actor.id:
        raise ValueError("Audit event must have a signed-in actor")

    details = details or {}
    # Only explicit, locally constructed metadata may be passed by trusted callers.
    db.add(AuditEvent(
        occurred_at=datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
        actor_id=actor.id, actor_username=actor.username, actor_role=actor.role,
        action=action, entity_type=entity_type, entity_id=entity_id,
        details_json=json.dumps(details, ensure_ascii=False, sort_keys=True),
    ))


class AuditEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    occurred_at: str
    actor_id: str
    actor_username: str
    actor_role: str
    action: str
    entity_type: str
    entity_id: str | None
    details: dict[str, str | int | bool | None]


class AuditPage(BaseModel):
    items: list[AuditEntry]
    total: int
    limit: int
    offset: int


@router.get("/audit", response_model=AuditPage)
def audit_history(
    db: Annotated[Session, Depends(get_db)],
    entity_type: Literal["incident", "prevention_plan", "incident_import"] | None = None,
    actor_id: Annotated[str | None, Query(max_length=36)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = select(AuditEvent)
    if entity_type is not None:
        query = query.where(AuditEvent.entity_type == entity_type)
    if actor_id:
        query = query.where(AuditEvent.actor_id == actor_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    events = db.scalars(query.order_by(AuditEvent.id.desc()).limit(limit).offset(offset)).all()
    return AuditPage(
        items=[AuditEntry(
            id=event.id, occurred_at=event.occurred_at,
            actor_id=event.actor_id, actor_username=event.actor_username,
            actor_role=event.actor_role, action=event.action,
            entity_type=event.entity_type, entity_id=event.entity_id,
            details=json.loads(event.details_json),
        ) for event in events],
        total=total, limit=limit, offset=offset,
    )
