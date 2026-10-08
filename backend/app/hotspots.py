"""Read-only, fixed-grid concentrations of synthetic demonstration incidents.

This is descriptive counting, not statistical significance or predicted risk.
The fixed local projection and study extent make cells comparable across filters.
"""
from datetime import date
from math import cos, pi
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, case, cast, func, literal, select, union_all
from sqlalchemy.orm import Session

from .analytics import DATA_LABEL, utc_boundary, zone_expression
from .db import get_db
from .models import Incident
from .schemas import Category, Status

router = APIRouter(prefix="/api/hotspots", tags=["hotspots"])

REFERENCE_LATITUDE = 11.935
REFERENCE_LONGITUDE = 79.83
EARTH_RADIUS_M = 6_371_008.8
LATITUDE_METERS_PER_DEGREE = EARTH_RADIUS_M * pi / 180
LONGITUDE_METERS_PER_DEGREE = LATITUDE_METERS_PER_DEGREE * cos(REFERENCE_LATITUDE * pi / 180)


class StudyBounds(BaseModel):
    south: float = 11.75
    west: float = 79.6
    north: float = 12.15
    east: float = 79.95


STUDY_BOUNDS = StudyBounds()


class CellProperties(BaseModel):
    cell_id: str
    count: int
    density_per_km2: float
    rank: int
    source_type: Literal["synthetic"] = "synthetic"


class CellGeometry(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]]


class CellFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: CellGeometry
    properties: CellProperties


class HotspotMetadata(BaseModel):
    source_type: Literal["synthetic"] = "synthetic"
    data_label: str = DATA_LABEL
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    method: Literal["grid_count"] = "grid_count"
    cell_size_m: int
    min_count: int
    total_matching_incidents: int
    analyzed_incidents: int
    excluded_incidents: int
    occupied_cells: int
    qualifying_cells: int
    incidents_in_qualifying_cells: int
    max_cell_count: int
    study_bounds: StudyBounds
    method_description: str = (
        "Counts in a fixed square grid using a local equirectangular approximation "
        "anchored at 11.935 N, 79.83 E (Earth radius 6371008.8 m). "
        "Cells meeting the minimum count are displayed; tied counts share a dense rank."
    )
    limitations: list[str] = [
        "Synthetic demonstration counts only; no verified police intelligence, "
        "statistical significance, crime risk estimate, or prediction.",
        "The fixed demonstration study extent is not an administrative or police boundary. "
        "Matching records outside it are excluded from the grid and counted separately.",
        "Density uses nominal square cell area, not population or exposure. "
        "Grid size, alignment, filters, and the minimum count affect the result.",
        "Full square cells may extend beyond the study extent; only records on or inside "
        "the study boundary are counted. Local distance and area are approximate.",
    ]


class HotspotResponse(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[CellFeature]
    meta: HotspotMetadata


def grid_index(coordinate, origin: float, meters_per_degree: float, cell_size_m: int):
    """SQL floor without requiring SQLite's optional math extension.

    Correct an integer cast that lands above the quotient by subtracting one.
    This handles SQLite truncation and PostgreSQL rounding, giving half-open,
    nonoverlapping cells on either side of the origin.
    """
    quotient = (coordinate - origin) * meters_per_degree / cell_size_m
    nearest_integer = cast(quotient, Integer)
    return case((quotient < nearest_integer, nearest_integer - 1), else_=nearest_integer)


def cell_geometry(x: int, y: int, cell_size_m: int) -> CellGeometry:
    west = REFERENCE_LONGITUDE + x * cell_size_m / LONGITUDE_METERS_PER_DEGREE
    east = REFERENCE_LONGITUDE + (x + 1) * cell_size_m / LONGITUDE_METERS_PER_DEGREE
    south = REFERENCE_LATITUDE + y * cell_size_m / LATITUDE_METERS_PER_DEGREE
    north = REFERENCE_LATITUDE + (y + 1) * cell_size_m / LATITUDE_METERS_PER_DEGREE
    return CellGeometry(coordinates=[[
        (west, south), (east, south), (east, north), (west, north), (west, south),
    ]])


@router.get("/grid", response_model=HotspotResponse)
def grid(
    db: Annotated[Session, Depends(get_db)],
    start_date: date | None = None,
    end_date: date | None = None,
    category: Category | None = None,
    status: Status | None = None,
    zone: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    unspecified_zone: bool = False,
    cell_size_m: Annotated[int, Query(ge=250, le=5000)] = 1000,
    min_count: Annotated[int, Query(ge=2, le=1000)] = 3,
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

    matching = select(Incident.latitude, Incident.longitude).where(*conditions).cte("matching_incidents")
    x = grid_index(matching.c.longitude, REFERENCE_LONGITUDE, LONGITUDE_METERS_PER_DEGREE, cell_size_m)
    y = grid_index(matching.c.latitude, REFERENCE_LATITUDE, LATITUDE_METERS_PER_DEGREE, cell_size_m)
    inside_study = (
        matching.c.latitude >= STUDY_BOUNDS.south,
        matching.c.latitude <= STUDY_BOUNDS.north,
        matching.c.longitude >= STUDY_BOUNDS.west,
        matching.c.longitude <= STUDY_BOUNDS.east,
    )
    cells = select(
        literal("cell").label("kind"), x.label("x"), y.label("y"), func.count().label("count"),
    ).select_from(matching).where(*inside_study).group_by(x, y)
    total = select(
        literal("total").label("kind"), literal(0).label("x"), literal(0).label("y"),
        func.count().label("count"),
    ).select_from(matching)

    # One statement gives the total and grid the same database snapshot. Only
    # aggregate counts cross the database boundary; there is no incident limit.
    occupied = []
    total_matching = 0
    for kind, cell_x, cell_y, count in db.execute(union_all(total, cells)):
        if kind == "total":
            total_matching = count
        else:
            occupied.append((cell_x, cell_y, count))
    occupied.sort(key=lambda cell: (-cell[2], cell[0], cell[1]))

    features = []
    rank = 0
    previous_count = None
    for cell_x, cell_y, count in occupied:
        if count < min_count:
            break
        if count != previous_count:
            rank += 1
            previous_count = count
        cell_id = f"grid-{cell_size_m}-{cell_x}-{cell_y}"
        features.append(CellFeature(
            id=cell_id,
            geometry=cell_geometry(cell_x, cell_y, cell_size_m),
            properties=CellProperties(
                cell_id=cell_id, count=count, rank=rank,
                density_per_km2=round(count * 1_000_000 / cell_size_m ** 2, 6),
            ),
        ))
    analyzed = sum(count for _, _, count in occupied)
    return HotspotResponse(
        features=features,
        meta=HotspotMetadata(
            cell_size_m=cell_size_m, min_count=min_count,
            total_matching_incidents=total_matching, analyzed_incidents=analyzed,
            excluded_incidents=total_matching - analyzed, occupied_cells=len(occupied),
            qualifying_cells=len(features),
            incidents_in_qualifying_cells=sum(feature.properties.count for feature in features),
            max_cell_count=occupied[0][2] if occupied else 0, study_bounds=STUDY_BOUNDS,
        ),
    )
