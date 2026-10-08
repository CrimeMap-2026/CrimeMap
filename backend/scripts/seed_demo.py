"""Idempotently insert the provided synthetic demonstration dataset."""
import csv
from pathlib import Path

from app.db import Base, SessionLocal, engine
from app.models import Incident
from app.schemas import IncidentCreate

CSV = Path(__file__).resolve().parents[2] / "data" / "synthetic_incidents.csv"


def main() -> None:
    Base.metadata.create_all(bind=engine)
    inserted = 0
    with SessionLocal() as db, CSV.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            identifier = row.pop("id")
            if db.get(Incident, identifier):
                continue
            item = IncidentCreate.model_validate({k: v for k, v in row.items() if v != ""})
            db.add(Incident(
                id=identifier,
                category=item.category.value,
                occurred_at=item.occurred_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                latitude=item.latitude,
                longitude=item.longitude,
                police_station=item.police_station,
                description=item.description,
                status=item.status.value,
                source_type="synthetic",
            ))
            inserted += 1
        db.commit()
    print(f"Inserted {inserted} synthetic incidents. No real crime reports are included.")


if __name__ == "__main__":
    main()
