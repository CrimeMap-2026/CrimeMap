"""Fictional operational assets for demonstrating layered command-center maps.

No GPS devices, camera streams, dispatch systems or police databases are connected.
These immutable examples intentionally do not claim to be real Puducherry assets.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from fastapi import APIRouter, Depends
from .auth import require_permission

router = APIRouter(prefix="/api/operations", tags=["synthetic-operations"], dependencies=[Depends(require_permission("read"))])

IST = timezone(timedelta(hours=5, minutes=30))
BASE_TIME = datetime(2026, 9, 18, 10, 0, tzinfo=IST)
STEPS = 7
INTERVAL_MINUTES = 10

CAMERAS = [
    {"id": "DEMO-CCTV-01", "label": "Demo camera A", "latitude": 11.9390, "longitude": 79.8301, "zone": "Demo Zone A", "status": "illustrative"},
    {"id": "DEMO-CCTV-02", "label": "Demo camera B", "latitude": 11.9284, "longitude": 79.8257, "zone": "Demo Zone B", "status": "illustrative"},
    {"id": "DEMO-CCTV-03", "label": "Demo camera C", "latitude": 11.9446, "longitude": 79.8357, "zone": "Demo Zone C", "status": "illustrative"},
    {"id": "DEMO-CCTV-04", "label": "Demo camera D", "latitude": 11.9333, "longitude": 79.8448, "zone": "Demo Zone D", "status": "illustrative"},
    {"id": "DEMO-CCTV-05", "label": "Demo camera E", "latitude": 11.9210, "longitude": 79.8411, "zone": "Demo Zone B", "status": "illustrative"},
]

ACCIDENTS = [
    {"id": "DEMO-ACC-01", "label": "Synthetic minor collision", "latitude": 11.9403, "longitude": 79.8332, "severity": "minor", "occurred_at": "2026-09-18T09:20:00+05:30"},
    {"id": "DEMO-ACC-02", "label": "Synthetic road incident", "latitude": 11.9265, "longitude": 79.8325, "severity": "moderate", "occurred_at": "2026-09-18T10:15:00+05:30"},
    {"id": "DEMO-ACC-03", "label": "Synthetic minor collision", "latitude": 11.9490, "longitude": 79.8400, "severity": "minor", "occurred_at": "2026-09-18T08:45:00+05:30"},
    {"id": "DEMO-ACC-04", "label": "Synthetic road incident", "latitude": 11.9313, "longitude": 79.8171, "severity": "moderate", "occurred_at": "2026-09-18T11:00:00+05:30"},
]

# The points are invented straight-line paths, not logged road routes.
PATROL_PATHS = [
    ("DEMO-UNIT-01", "Demo patrol Alpha", "demo_route", [
        (11.9290, 79.8210), (11.9307, 79.8234), (11.9329, 79.8258),
        (11.9350, 79.8284), (11.9373, 79.8309), (11.9389, 79.8333), (11.9405, 79.8356),
    ]),
    ("DEMO-UNIT-02", "Demo patrol Bravo", "demo_route", [
        (11.9500, 79.8421), (11.9479, 79.8408), (11.9460, 79.8390),
        (11.9438, 79.8364), (11.9417, 79.8346), (11.9393, 79.8322), (11.9370, 79.8305),
    ]),
    ("DEMO-UNIT-03", "Demo patrol Charlie", "demo_route", [
        (11.9198, 79.8398), (11.9218, 79.8392), (11.9233, 79.8371),
        (11.9255, 79.8355), (11.9280, 79.8333), (11.9301, 79.8310), (11.9320, 79.8298),
    ]),
]


def make_patrol(unit_id, label, status, locations):
    return {
        "id": unit_id,
        "label": label,
        "status": status,
        "source_type": "synthetic",
        "track": [
            {
                "timestamp": (BASE_TIME + timedelta(minutes=i * INTERVAL_MINUTES)).isoformat(),
                "latitude": lat,
                "longitude": lon,
            }
            for i, (lat, lon) in enumerate(locations)
        ],
    }


@router.get("/overview")
def overview():
    """Read-only synthetic overlays with timestamped *historical demo* tracks."""
    return {
        "source_type": "synthetic",
        "data_label": "SYNTHETIC DEMONSTRATION DATA",
        "simulation": True,
        "live_tracking": False,
        "timezone": "Asia/Kolkata",
        "description": "Fictional patrol routes, hypothetical CCTV assets and accident records. No live feeds or actual police assets.",
        "timeline": {
            "start": BASE_TIME.isoformat(),
            "interval_minutes": INTERVAL_MINUTES,
            "steps": STEPS,
        },
        "cameras": [{**camera, "source_type": "synthetic"} for camera in CAMERAS],
        "accidents": [{**accident, "source_type": "synthetic"} for accident in ACCIDENTS],
        "patrols": [make_patrol(*unit) for unit in PATROL_PATHS],
    }
