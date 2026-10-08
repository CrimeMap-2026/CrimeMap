"""Persistent incident records. No personal identifying information is stored."""
from sqlalchemy import Float, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # UTC ISO8601 text sorts correctly in SQLite and PostgreSQL.
    occurred_at: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    police_station: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="reported")
    source_type: Mapped[str] = mapped_column(String(16), nullable=False, default="synthetic")

    __table_args__ = (Index("ix_incidents_category_date", "category", "occurred_at"),)
