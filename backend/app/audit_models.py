"""Append-only application change history for the synthetic prototype.

Only application-generated, allowlisted metadata is recorded. Do not store
credentials, session tokens, incident descriptions, or prevention-plan notes.
The model deliberately does not cascade on user changes: preserve attribution.
"""
from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occurred_at: Mapped[str] = mapped_column(String(27), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_username: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(12), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    __table_args__ = (
        Index("ix_audit_events_entity", "entity_type", "entity_id", "id"),
        Index("ix_audit_events_actor", "actor_id", "id"),
    )
