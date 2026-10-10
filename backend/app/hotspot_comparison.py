"""Compare *descriptive* fixed-grid concentrations across equal-length local date periods.

Reuses the exact study extent, grid origin, geometry and common filters of
/api/hotspots/grid. No forecast, validated hotspot or crime-risk estimate.
"""
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, literal, select, union_all
from sqlalchemy.orm import Session

from .auth import require_permission
from .db import get_db
from .hotspots import (
    REFERENCE_LATITUDE, REFERENCE_LONGITUDE, LATITUDE_METERS_PER_DEGREE,
    LONGITUDE_METERS_PER_DEGREE, STUDY_BOUNDS, CellGeometry, StudyBounds,
    cell_geometry, grid_index,
)
from .models import Incident
from .schemas import Category, Status
from .spatial_filters import incident_conditions

router = APIRouter(prefix="/api/hotspots", tags=["hotspots"], dependencies=[Depends(require_permission("analyze"))])
CLASSIFICATIONS = (
    "newly_above_threshold", "persistently_above_threshold", "fell_below_threshold",
)


class CompareCellProperties(BaseModel):
    cell_id: str
    previous_count: int
    current_count: int
    change: int
    classification: Literal[
        "newly_above_threshold", "persistently_above_threshold", "fell_below_threshold"
    ]
    source_type: Literal["synthetic"] = "synthetic"


class CompareFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: CellGeometry
    properties: CompareCellProperties


class CompareMeta(BaseModel):
    source_type: Literal["synthetic"] = "synthetic"
    data_label: str = "SYNTHETIC DEMONSTRATION DATA"
    method: Literal["equal_period_grid_comparison"] = "equal_period_grid_comparison"
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    study_bounds: StudyBounds
    cell_size_m: int
    min_count: int
    previous_start_date: date
    previous_end_date: date
    current_start_date: date
    current_end_date: date
    period_days: int
    total_previous: int
    total_current: int
    analyzed_previous: int
    analyzed_current: int
    excluded_previous: int
    excluded_current: int
    cells_newly_above_threshold: int
    cells_persistently_above_threshold: int
    cells_fell_below_threshold: int
    displayed_cells: int
    methodology: str = (
        "Each period uses the same local calendar duration, study extent, projection, "
        "grid alignment, cell width and category/status/zone filters. A cell is newly "
        "above threshold if it meets the minimum only in the current period; persistent "
        "if it meets it in both; and fell below if it met it only in the previous period."
    )
    limitations: list[str] = Field(default_factory=lambda: [
        "Fictional incident counts only: no statistical significance, validated hotspots, "
        "crime-risk estimates or forecasts.",
        "Differences in counts do not demonstrate a real-world trend or causal effect. "
        "Reporting volume, population/exposure and other confounders are not adjusted.",
        "The rectangular demonstration study extent is not an official police boundary. "
        "Records outside it are excluded from cell counts and tracked separately.",
        "Cells below threshold in both periods are omitted; absence does not mean safety.",
    ])


class CompareResponse(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[CompareFeature]
    meta: CompareMeta


@router.get("/compare", response_model=CompareResponse)
def compare(
    db: Annotated[Session, Depends(get_db)],
    previous_start_date: date,
    previous_end_date: date,
    current_start_date: date,
    current_end_date: date,
    category: Category | None = None,
    status: Status | None = None,
    zone: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    unspecified_zone: bool = False,
    cell_size_m: Annotated[int, Query(ge=250, le=5000)] = 1000,
    min_count: Annotated[int, Query(ge=2, le=1000)] = 3,
):
    if previous_start_date > previous_end_date or current_start_date > current_end_date:
        raise HTTPException(422, "Each period must start on or before its end date")
    if previous_end_date >= current_start_date:
        raise HTTPException(422, "Comparison periods must be ordered and must not overlap")
    previous_days = (previous_end_date - previous_start_date).days + 1
    current_days = (current_end_date - current_start_date).days + 1
    if previous_days != current_days:
        raise HTTPException(422, "Choose two periods with the same number of calendar days")
    if previous_days > 366:
        raise HTTPException(422, "Each comparison period must be at most 366 days")

    statements = []
    for label, start, end in (
        ("previous", previous_start_date, previous_end_date),
        ("current", current_start_date, current_end_date),
    ):
        conditions = incident_conditions(
            start_date=start, end_date=end, category=category,
            status=status, zone=zone, unspecified_zone=unspecified_zone,
        )
        matching = select(
            Incident.latitude.label("latitude"), Incident.longitude.label("longitude")
        ).where(*conditions).cte(f"matching_{label}")
        x = grid_index(matching.c.longitude, REFERENCE_LONGITUDE, LONGITUDE_METERS_PER_DEGREE, cell_size_m)
        y = grid_index(matching.c.latitude, REFERENCE_LATITUDE, LATITUDE_METERS_PER_DEGREE, cell_size_m)
        in_extent = (
            matching.c.latitude >= STUDY_BOUNDS.south,
            matching.c.latitude <= STUDY_BOUNDS.north,
            matching.c.longitude >= STUDY_BOUNDS.west,
            matching.c.longitude <= STUDY_BOUNDS.east,
        )
        statements.append(
            select(
                literal(label).label("period"), literal("cell").label("kind"),
                x.label("x"), y.label("y"), func.count().label("count"),
            ).select_from(matching).where(*in_extent).group_by(x, y)
        )
        statements.append(
            select(
                literal(label).label("period"), literal("total").label("kind"),
                literal(0).label("x"), literal(0).label("y"), func.count().label("count"),
            ).select_from(matching)
        )

    by_period = {"previous": {}, "current": {}}
    totals = {"previous": 0, "current": 0}
    for period, kind, x, y, count in db.execute(union_all(*statements)):
        if kind == "total":
            totals[period] = count
        else:
            by_period[period][(x, y)] = count

    features = []
    summary = {kind: 0 for kind in CLASSIFICATIONS}
    cells = set(by_period["previous"]) | set(by_period["current"])
    for x, y in cells:
        prev = by_period["previous"].get((x, y), 0)
        curr = by_period["current"].get((x, y), 0)
        prev_high = prev >= min_count
        curr_high = curr >= min_count
        if not (prev_high or curr_high):
            continue
        if not prev_high:
            classification = "newly_above_threshold"
        elif not curr_high:
            classification = "fell_below_threshold"
        else:
            classification = "persistently_above_threshold"
        summary[classification] += 1
        cell_id = f"grid-{cell_size_m}-{x}-{y}"
        features.append(CompareFeature(
            id=cell_id,
            geometry=cell_geometry(x, y, cell_size_m),
            properties=CompareCellProperties(
                cell_id=cell_id, previous_count=prev, current_count=curr,
                change=curr - prev, classification=classification,
            ),
        ))
    features.sort(key=lambda item: (-item.properties.current_count, -item.properties.previous_count, item.id))
    previous_analyzed = sum(by_period["previous"].values())
    current_analyzed = sum(by_period["current"].values())
    return CompareResponse(
        features=features,
        meta=CompareMeta(
            study_bounds=STUDY_BOUNDS, cell_size_m=cell_size_m, min_count=min_count,
            previous_start_date=previous_start_date, previous_end_date=previous_end_date,
            current_start_date=current_start_date, current_end_date=current_end_date,
            period_days=previous_days, total_previous=totals["previous"],
            total_current=totals["current"],
            analyzed_previous=previous_analyzed, analyzed_current=current_analyzed,
            excluded_previous=totals["previous"]-previous_analyzed,
            excluded_current=totals["current"]-current_analyzed,
            cells_newly_above_threshold=summary["newly_above_threshold"],
            cells_persistently_above_threshold=summary["persistently_above_threshold"],
            cells_fell_below_threshold=summary["fell_below_threshold"],
            displayed_cells=len(features),
        ),
    )
