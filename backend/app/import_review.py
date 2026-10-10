"""Synthetic incident import review and advisory duplicate checks.

Review and import use identical validation/duplicate rules. Signatures compare
category, stored UTC-second timestamp, and coordinates rounded to six decimals.
They are hints rather than definitive proof of the same underlying event.
"""
from collections.abc import Sequence
from datetime import timezone

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Incident
from .schemas import IncidentCreate

MAX_BATCH = 1000
BOUNDS = (11.75, 79.6, 12.15, 79.95)


def stored_utc(value: IncidentCreate) -> str:
    return value.occurred_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def signature(category: str, occurred_at: str, latitude: float, longitude: float):
    return category, occurred_at, round(latitude, 6), round(longitude, 6)


def fingerprint(item: IncidentCreate):
    return signature(item.category.value, stored_utc(item), item.latitude, item.longitude)


def parse_rows(rows: Sequence[dict], *, collect_errors: bool):
    """Return (validated input with original row numbers, invalid row summaries).

    The legacy import remains strict and atomic. The preview collects all
    validation issues so the operator can fix the file before importing.
    """
    parsed = []
    invalid = []
    for row_number, raw in enumerate(rows, start=1):
        if not isinstance(raw, dict):
            error = {"row": row_number, "error": "Record must be an object"}
            if not collect_errors:
                from fastapi import HTTPException
                raise HTTPException(422, detail=error)
            invalid.append({"row": row_number, "status": "invalid", "errors": [error["error"]]})
            continue
        # Shipped seed-data CSVs include stable DEMO-xxxx identifiers.
        # Those identifiers belong to the seed script, not the public create API.
        # Accept the optional import-only 'id' as metadata, but NEVER trust or
        # persist it: new imports receive server-generated UUIDs as before.
        # Every other unexpected field remains forbidden by IncidentCreate.
        normalized = {
            key: (val if val != "" else None)
            for key, val in raw.items() if key != "id"
        }
        try:
            item = IncidentCreate.model_validate(normalized)
        except ValidationError as exc:
            if not collect_errors:
                from fastapi import HTTPException
                raise HTTPException(422, detail={
                    "row": row_number,
                    "errors": exc.errors(include_context=False, include_url=False),
                }) from exc
            messages = [
                f"{'.'.join(map(str, issue['loc'])) or 'record'}: {issue['msg']}"
                for issue in exc.errors(include_context=False, include_url=False)
            ]
            invalid.append({"row": row_number, "status": "invalid", "errors": messages[:8]})
            continue
        parsed.append((row_number, item))
    return parsed, invalid


def find_existing_signatures(db: Session, parsed):
    """Read only relevant timestamps in bounded batches (SQLite parameter safe)."""
    times = sorted({stored_utc(item) for _, item in parsed})
    existing = set()
    for start in range(0, len(times), 200):
        rows = db.execute(select(
            Incident.category, Incident.occurred_at, Incident.latitude, Incident.longitude,
        ).where(
            Incident.source_type == "synthetic",
            Incident.occurred_at.in_(times[start:start + 200]),
        ))
        for category, occurred_at, latitude, longitude in rows:
            existing.add(signature(category, occurred_at, latitude, longitude))
    return existing


def review_rows(db: Session, parsed, invalid):
    existing = find_existing_signatures(db, parsed)
    seen = set()
    items = list(invalid)
    counters = {"ready": 0, "duplicate_existing": 0, "duplicate_file": 0, "invalid": len(invalid), "warnings": 0}
    accepted = []
    for row_number, item in parsed:
        key = fingerprint(item)
        if key in seen:
            status = "duplicate_file"
        elif key in existing:
            status = "duplicate_existing"
        else:
            status = "ready"
            accepted.append(item)
        seen.add(key)
        warnings = []
        south, west, north, east = BOUNDS
        if not (south <= item.latitude <= north and west <= item.longitude <= east):
            warnings.append("Outside the demonstration grid extent")
        if not item.police_station or not item.police_station.strip():
            warnings.append("Demonstration zone not specified")
        if warnings:
            counters["warnings"] += 1
        counters[status] += 1
        items.append({
            "row": row_number, "status": status, "category": item.category.value,
            "occurred_at": stored_utc(item), "latitude": item.latitude, "longitude": item.longitude,
            "zone": item.police_station, "warnings": warnings,
        })
    items.sort(key=lambda row: row["row"])
    return {
        "rows": items, "total": len(items), **counters,
        "accepted": accepted,
    }
