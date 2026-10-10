"""CrimeMap API: incident management and bounded geospatial map queries."""
import csv
import io
import json
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Incident
from .analytics import router as analytics_router
from .hotspots import router as hotspots_router
from .hotspot_comparison import router as hotspot_comparison_router
from .operations import router as operations_router
from .prevention import router as prevention_router
from .auth import router as auth_router, require_permission, check_request_origin
from .schemas import Category, ImportResult, IncidentCreate, IncidentPage, IncidentPatch, IncidentRead, Status

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_ROWS = 1000


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="CrimeMap API", version="0.1.0", lifespan=lifespan)
app.include_router(analytics_router)
app.include_router(hotspots_router)
app.include_router(hotspot_comparison_router)
app.include_router(operations_router)
app.include_router(prevention_router)
app.include_router(auth_router)


@app.middleware("http")
async def protect_api_requests(request: Request, call_next):
    # Reject browser writes from different origins; complements SameSite=Strict cookies.
    if request.url.path.startswith("/api/") and request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        try:
            check_request_origin(request)
        except HTTPException:
            return JSONResponse(status_code=403, content={"detail": "Cross-origin changes are not allowed"},
                                headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def to_utc_string(item: IncidentCreate) -> str:
    return item.occurred_at.strftime("%Y-%m-%dT%H:%M:%SZ")


def to_read(incident: Incident) -> IncidentRead:
    return IncidentRead.model_validate({
        "id": incident.id,
        "category": incident.category,
        "occurred_at": incident.occurred_at,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "police_station": incident.police_station,
        "description": incident.description,
        "status": incident.status,
        "source_type": incident.source_type,
    })


def new_record(item: IncidentCreate) -> Incident:
    return Incident(
        id=str(uuid.uuid4()),
        category=item.category.value,
        occurred_at=to_utc_string(item),
        latitude=item.latitude,
        longitude=item.longitude,
        police_station=item.police_station,
        description=item.description,
        status=item.status.value,
        source_type="synthetic",
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/incidents", response_model=IncidentPage, dependencies=[Depends(require_permission("read"))])
def list_incidents(
    db: Annotated[Session, Depends(get_db)],
    category: Category | None = None,
    status: Status | None = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = select(Incident)
    if category is not None:
        query = query.where(Incident.category == category.value)
    if status is not None:
        query = query.where(Incident.status == status.value)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Incident.police_station.ilike(term), Incident.description.ilike(term)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    records = db.scalars(query.order_by(Incident.occurred_at.desc(), Incident.id).offset(offset).limit(limit)).all()
    return IncidentPage(items=[to_read(rec) for rec in records], total=total, limit=limit, offset=offset)


@app.get("/api/map/incidents", dependencies=[Depends(require_permission("read"))])
def map_incidents(
    db: Annotated[Session, Depends(get_db)],
    south: Annotated[float, Query(ge=-90, le=90, allow_inf_nan=False)],
    west: Annotated[float, Query(ge=-180, le=180, allow_inf_nan=False)],
    north: Annotated[float, Query(ge=-90, le=90, allow_inf_nan=False)],
    east: Annotated[float, Query(ge=-180, le=180, allow_inf_nan=False)],
    category: Category | None = None,
    status: Status | None = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 2000,
):
    """Return GeoJSON points inside one viewport; never imply the data is official.

    The MVP serves a bounded number of records. For city-scale production datasets,
    replace this with PostGIS spatial indexes, clustering and/or vector tiles.
    """
    if south > north or west > east:
        raise HTTPException(status_code=422, detail="Invalid bounds: south <= north and west <= east required")

    query = select(Incident).where(
        Incident.latitude >= south,
        Incident.latitude <= north,
        Incident.longitude >= west,
        Incident.longitude <= east,
    )
    if category is not None:
        query = query.where(Incident.category == category.value)
    if status is not None:
        query = query.where(Incident.status == status.value)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    records = db.scalars(query.order_by(Incident.occurred_at.desc(), Incident.id).limit(limit)).all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": record.id,
                "geometry": {"type": "Point", "coordinates": [record.longitude, record.latitude]},
                "properties": {
                    "category": record.category,
                    "occurred_at": record.occurred_at,
                    "police_station": record.police_station,
                    "description": record.description,
                    "status": record.status,
                    "source_type": record.source_type,
                },
            }
            for record in records
        ],
        "meta": {
            "total": total,
            "returned": len(records),
            "truncated": total > len(records),
            "source_type": "synthetic",
        },
    }


@app.post("/api/incidents", response_model=IncidentRead, status_code=201, dependencies=[Depends(require_permission("write"))])
def add_incident(payload: IncidentCreate, db: Annotated[Session, Depends(get_db)]):
    record = new_record(payload)
    db.add(record)
    db.commit()
    return to_read(record)


@app.get("/api/incidents/{incident_id}", response_model=IncidentRead, dependencies=[Depends(require_permission("read"))])
def get_incident(incident_id: str, db: Annotated[Session, Depends(get_db)]):
    record = db.get(Incident, incident_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return to_read(record)


@app.patch("/api/incidents/{incident_id}", response_model=IncidentRead, dependencies=[Depends(require_permission("write"))])
def update_incident(incident_id: str, payload: IncidentPatch, db: Annotated[Session, Depends(get_db)]):
    record = db.get(Incident, incident_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    changes = payload.model_dump(exclude_unset=True)
    if "status" in changes:
        if changes["status"] is None:
            raise HTTPException(status_code=422, detail="status cannot be null")
        record.status = changes["status"].value
    if "description" in changes:
        record.description = changes["description"]
    db.commit()
    return to_read(record)


@app.delete("/api/incidents/{incident_id}", status_code=204, dependencies=[Depends(require_permission("delete"))])
def delete_incident(incident_id: str, db: Annotated[Session, Depends(get_db)]):
    record = db.get(Incident, incident_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    db.delete(record)
    db.commit()


def decode_import(filename: str, raw: bytes) -> list[dict]:
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File must be UTF-8") from exc
    extension = filename.lower().rsplit(".", 1)[-1]
    if extension == "csv":
        reader = csv.DictReader(io.StringIO(content))
        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV header is missing")
        return list(reader)
    if extension == "json":
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON") from exc
        if isinstance(data, dict):
            data = data.get("incidents")
        if not isinstance(data, list):
            raise HTTPException(status_code=400, detail="JSON must be an array or an object with an incidents array")
        return data
    raise HTTPException(status_code=400, detail="Upload a .csv or .json file")


@app.post("/api/incidents/import", response_model=ImportResult, status_code=201, dependencies=[Depends(require_permission("write"))])
async def import_incidents(db: Annotated[Session, Depends(get_db)], file: UploadFile = File(...)):
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 2 MB")
    rows = decode_import(file.filename or "", raw)
    if not rows:
        raise HTTPException(status_code=400, detail="No incident records found")
    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=413, detail="Maximum 1000 records per import")
    parsed = []
    for i, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise HTTPException(status_code=422, detail={"row": i, "error": "Record must be an object"})
        normalized = {k: (v if v != "" else None) for k, v in row.items()}
        try:
            parsed.append(IncidentCreate.model_validate(normalized))
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail={"row": i, "errors": exc.errors(include_context=False, include_url=False)}) from exc
    # Validation completes before any record is persisted.
    db.add_all(new_record(item) for item in parsed)
    db.commit()
    return ImportResult(imported=len(parsed))
