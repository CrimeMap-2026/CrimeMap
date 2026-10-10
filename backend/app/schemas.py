"""Input/output schemas. All imported records are explicitly synthetic."""
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, field_serializer


class Category(str, Enum):
    theft = "Theft"
    vehicle_theft = "Vehicle Theft"
    burglary = "Burglary"
    robbery = "Robbery"
    assault = "Assault"
    cybercrime = "Cybercrime"
    vandalism = "Vandalism"
    other = "Other"


class Status(str, Enum):
    reported = "reported"
    investigating = "under_investigation"
    closed = "closed"


class IncidentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    category: Category
    occurred_at: datetime
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]
    police_station: Annotated[str | None, Field(max_length=120)] = None
    description: Annotated[str | None, Field(max_length=2000)] = None
    status: Status = Status.reported

    @field_validator("occurred_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("occurred_at must include a timezone offset")
        return value.astimezone(timezone.utc)

    @field_serializer("occurred_at", when_used="json")
    def serialize_utc(self, value: datetime) -> str:
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")


class IncidentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: Status | None = None
    description: Annotated[str | None, Field(max_length=2000)] = None


class IncidentRead(IncidentCreate):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: str
    source_type: str


class IncidentPage(BaseModel):
    items: list[IncidentRead]
    total: int
    limit: int
    offset: int


class ImportResult(BaseModel):
    imported: int
    skipped: int | None = None
    source_type: str = "synthetic"
