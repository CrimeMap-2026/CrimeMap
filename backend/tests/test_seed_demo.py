"""Check that the supplied 100 fictional records seed without duplicating or erasing user data."""
import csv
from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.models import Incident
from app.schemas import IncidentCreate
from scripts import seed_demo

ROOT = Path(__file__).resolve().parents[2]
SEED_CSV = ROOT / "data" / "synthetic_incidents.csv"
PUBLIC_CSV = ROOT / "frontend" / "public" / "sample-data" / "synthetic_incidents.csv"


def read_csv(path):
    with path.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def test_bundled_samples_are_exactly_100_and_consistent():
    master = read_csv(SEED_CSV)
    public = read_csv(PUBLIC_CSV)
    assert len(master) == len(public) == 100
    assert [record["id"] for record in master] == [f"DEMO-{i:04d}" for i in range(1, 101)]
    assert len({record["id"] for record in master}) == 100
    assert all(record["description"].startswith("SYNTHETIC DEMO:") for record in master)
    for private, uploaded in zip(master, public):
        assert {key: value for key, value in private.items() if key != "id"} == uploaded
        assert IncidentCreate.model_validate(uploaded)
        assert 11.9 <= float(uploaded["latitude"]) <= 12.0
        assert 79.8 <= float(uploaded["longitude"]) <= 79.9


def test_reseed_adds_only_missing_64_and_preserves_edits(tmp_path, monkeypatch):
    # This isolated database is never the developer's existing SQLite file.
    test_engine = create_engine(f"sqlite:///{tmp_path / 'seed-tests.db'}")
    Base.metadata.create_all(test_engine)
    original = read_csv(SEED_CSV)
    with Session(test_engine) as db:
        for row in original[:36]:
            validated = IncidentCreate.model_validate(
                {key: value for key, value in row.items() if key != "id"})
            db.add(Incident(
                id=row["id"], category=validated.category.value,
                occurred_at=validated.occurred_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                latitude=validated.latitude, longitude=validated.longitude,
                police_station=validated.police_station,
                description=validated.description,
                status=validated.status.value, source_type="synthetic",
            ))
        preserved = db.get(Incident, "DEMO-0001")
        preserved.description = "A locally edited synthetic note"
        preserved.status = "closed"
        db.add(Incident(
            id="LOCAL-CUSTOM", category="Other", occurred_at="2026-09-10T10:00:00Z",
            latitude=11.935, longitude=79.830, police_station="Custom Demo Zone",
            description="A user's custom synthetic record", status="reported",
            source_type="synthetic",
        ))
        db.commit()

    monkeypatch.setattr(seed_demo, "engine", test_engine)
    monkeypatch.setattr(seed_demo, "SessionLocal",
                        sessionmaker(bind=test_engine, expire_on_commit=False))
    seed_demo.main()
    with Session(test_engine) as db:
        assert db.scalar(select(func.count()).select_from(Incident)) == 101
        assert db.get(Incident, "DEMO-0001").description == "A locally edited synthetic note"
        assert db.get(Incident, "DEMO-0001").status == "closed"
        assert db.get(Incident, "LOCAL-CUSTOM").description == "A user's custom synthetic record"
        assert db.get(Incident, "DEMO-0100") is not None
    seed_demo.main()
    with Session(test_engine) as db:
        assert db.scalar(select(func.count()).select_from(Incident)) == 101
    test_engine.dispose()
