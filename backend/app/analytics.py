"""Read-only analytics over the complete filtered synthetic dataset."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import DateTime, String, cast, func, literal, select, union_all
from sqlalchemy.orm import Session

from .db import get_db
from .auth import require_permission
from .models import Incident
from .schemas import Category, Status

router = APIRouter(prefix="/api/analytics", tags=["analytics"], dependencies=[Depends(require_permission("analyze"))])
LOCAL_TZ = ZoneInfo("Asia/Kolkata")
DATA_LABEL = "SYNTHETIC DEMONSTRATION DATA"


class Bucket(BaseModel):
    key: str | None
    count: int


class Summary(BaseModel):
    total_incidents: int
    category_count: int
    most_frequent_category: str | None
    most_frequent_count: int
    top_categories: list[str]
    zone_count: int
    unspecified_zone_count: int


class AnalyticsResponse(BaseModel):
    source_type: Literal["synthetic"] = "synthetic"
    data_label: str = DATA_LABEL
    timezone: str = "Asia/Kolkata"
    trend_interval: Literal["day", "month", "year"]
    summary: Summary
    by_category: list[Bucket]
    by_status: list[Bucket]
    by_date: list[Bucket]
    by_hour: list[Bucket]
    by_zone: list[Bucket]


class FilterOptions(BaseModel):
    source_type: Literal["synthetic"] = "synthetic"
    data_label: str = DATA_LABEL
    categories: list[str]
    statuses: list[str]
    zones: list[str]
    has_unspecified_zone: bool


def zone_expression():
    # Keep missing zones separate from a real zone literally named "Unspecified".
    return func.nullif(func.trim(Incident.police_station), "")


@router.get("/filters", response_model=FilterOptions)
def filter_options(db: Annotated[Session, Depends(get_db)]):
    zones = db.scalars(select(zone_expression()).where(
        Incident.source_type == "synthetic"
    ).distinct()).all()
    return FilterOptions(
        categories=[item.value for item in Category],
        statuses=[item.value for item in Status],
        zones=sorted(zone for zone in zones if zone is not None),
        has_unspecified_zone=None in zones,
    )


def utc_boundary(value: date, end: bool = False) -> str:
    """Inclusive local calendar dates, translated to indexed UTC text bounds."""
    local = datetime.combine(value, time.max if end else time.min, LOCAL_TZ)
    try:
        return local.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    except OverflowError as exc:
        raise HTTPException(422, "Date is outside the supported timezone range") from exc


def fill_trend(counts: dict, start: date | None, end: date | None):
    """Fill zero buckets; coarsen long ranges so the chart stays usable."""
    if not counts:
        return "day", []
    first = start or date.fromisoformat(min(counts))
    last = end or date.fromisoformat(max(counts))
    interval = "day" if (last - first).days <= 366 else "month"
    if (last.year - first.year) * 12 + last.month - first.month > 366:
        interval = "year"
    width = {"day": 10, "month": 7, "year": 4}[interval]
    grouped = defaultdict(int)
    for key, count in counts.items():
        grouped[key[:width]] += count
    cursor = first if interval == "day" else first.replace(day=1)
    if interval == "year":
        cursor = cursor.replace(month=1)
    result = []
    while cursor <= last:
        key = cursor.isoformat()[:width]
        result.append(Bucket(key=key, count=grouped[key]))
        if key == last.isoformat()[:width]:
            break
        if interval == "day":
            cursor += timedelta(days=1)
        elif interval == "month":
            cursor = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)
        else:
            cursor = date(cursor.year + 1, 1, 1)
    return interval, result


@router.get("/overview", response_model=AnalyticsResponse)
def overview(
    db: Annotated[Session, Depends(get_db)],
    start_date: date | None = None,
    end_date: date | None = None,
    category: Category | None = None,
    status: Status | None = None,
    zone: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    unspecified_zone: bool = False,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date")
    if zone is not None and (unspecified_zone or not zone.strip()):
        raise HTTPException(422, "Choose a named zone or unspecified_zone, not both")

    conditions = [Incident.source_type == "synthetic"]
    if start_date:
        conditions.append(Incident.occurred_at >= utc_boundary(start_date))
    if end_date:
        conditions.append(Incident.occurred_at <= utc_boundary(end_date, end=True))
    if category is not None:
        conditions.append(Incident.category == category.value)
    if status is not None:
        conditions.append(Incident.status == status.value)
    if zone is not None:
        conditions.append(zone_expression() == zone.strip())
    if unspecified_zone:
        conditions.append(zone_expression().is_(None))

    if db.get_bind().dialect.name == "postgresql":
        local = func.timezone("Asia/Kolkata", cast(Incident.occurred_at, DateTime(timezone=True)))
        local_date = func.to_char(local, "YYYY-MM-DD")
        local_hour = func.to_char(local, "HH24")
    else:
        # Stored timestamps are UTC; SQLite's explicit offset is independent of
        # the host timezone. Asia/Kolkata is UTC+05:30 for this modern demo data.
        local_date = func.strftime("%Y-%m-%d", Incident.occurred_at, "+05:30")
        local_hour = func.strftime("%H", Incident.occurred_at, "+05:30")

    filtered = select(
        Incident.category.label("category"), Incident.status.label("status"),
        zone_expression().label("zone"), local_date.label("date"), local_hour.label("hour"),
    ).where(*conditions).cte("matching_incidents")
    # One SQL statement gives every chart the same database snapshot. Only
    # GROUP BY counts cross the database boundary; no incident-page truncation.
    queries = [select(
        literal(dimension).label("dimension"),
        cast(filtered.c[dimension], String).label("key"),
        func.count().label("count"),
    ).group_by(filtered.c[dimension]) for dimension in ("category", "status", "zone", "date", "hour")]
    groups = {dimension: {} for dimension in ("category", "status", "zone", "date", "hour")}
    for dimension, key, count in db.execute(union_all(*queries)):
        groups[dimension][key] = count

    categories = sorted(groups["category"].items(), key=lambda item: (-item[1], item[0]))
    top_count = categories[0][1] if categories else 0
    top_categories = [key for key, count in categories if count == top_count]
    interval, trend = fill_trend(groups["date"], start_date, end_date)
    return AnalyticsResponse(
        trend_interval=interval,
        summary=Summary(
            total_incidents=sum(groups["category"].values()),
            category_count=len(categories),
            most_frequent_category=top_categories[0] if top_categories else None,
            most_frequent_count=top_count, top_categories=top_categories,
            zone_count=sum(key is not None for key in groups["zone"]),
            unspecified_zone_count=groups["zone"].get(None, 0),
        ),
        by_category=[Bucket(key=key, count=count) for key, count in categories],
        by_status=[Bucket(key=item.value, count=groups["status"].get(item.value, 0)) for item in Status],
        by_date=trend,
        by_hour=[Bucket(key=f"{hour:02d}", count=groups["hour"].get(f"{hour:02d}", 0)) for hour in range(24)],
        by_zone=[Bucket(key=key, count=count) for key, count in sorted(
            groups["zone"].items(), key=lambda item: (-item[1], item[0] or "")
        )],
    )
