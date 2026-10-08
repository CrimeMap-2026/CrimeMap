"""Module 02: geospatial API behavior with only synthetic records."""

DEMO = {
    "category": "Vehicle Theft",
    "occurred_at": "2026-09-12T21:30:00+05:30",
    "latitude": 11.9345,
    "longitude": 79.8302,
    "police_station": "Demo Zone A",
    "description": "SYNTHETIC TEST RECORD",
    "status": "reported",
}

PUDUCHERRY = {"south": 11.9, "west": 79.8, "north": 12.0, "east": 79.9}


def test_map_returns_geojson_coordinates_in_lon_lat_order(client):
    incident = client.post('/api/incidents', json=DEMO).json()
    resp = client.get('/api/map/incidents', params=PUDUCHERRY)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['type'] == 'FeatureCollection'
    assert body['meta'] == {'total': 1, 'returned': 1, 'truncated': False, 'source_type': 'synthetic'}
    feature = body['features'][0]
    assert feature['type'] == 'Feature'
    assert feature['id'] == incident['id']
    assert feature['geometry'] == {'type': 'Point', 'coordinates': [79.8302, 11.9345]}
    assert feature['properties']['source_type'] == 'synthetic'
    assert feature['properties']['status'] == 'reported'


def test_map_bounds_and_category_status_filters(client):
    client.post('/api/incidents', json=DEMO)
    client.post('/api/incidents', json={**DEMO, 'latitude': 12.2, 'status': 'closed'})
    client.post('/api/incidents', json={**DEMO, 'category': 'Theft'})
    assert client.get('/api/map/incidents', params=PUDUCHERRY).json()['meta']['total'] == 2
    assert client.get('/api/map/incidents', params={**PUDUCHERRY, 'category': 'Vehicle Theft'}).json()['meta']['total'] == 1
    assert client.get('/api/map/incidents', params={**PUDUCHERRY, 'status': 'closed'}).json()['meta']['total'] == 0
    assert client.get('/api/map/incidents', params={**PUDUCHERRY, 'south': 13.0, 'north': 13.5}).json()['features'] == []


def test_map_paging_limit_warns_on_truncation(client):
    for i in range(3):
        assert client.post('/api/incidents', json={**DEMO, 'description': str(i)}).status_code == 201
    body = client.get('/api/map/incidents', params={**PUDUCHERRY, 'limit': 2}).json()
    assert body['meta']['total'] == 3
    assert body['meta']['returned'] == 2
    assert body['meta']['truncated'] is True
    assert len(body['features']) == 2


def test_map_rejects_invalid_bounds_and_filters(client):
    for params in (
        {**PUDUCHERRY, 'south': 12.1},
        {**PUDUCHERRY, 'east': 79.7},
        {**PUDUCHERRY, 'north': 99},
        {**PUDUCHERRY, 'limit': 2001},
        {**PUDUCHERRY, 'category': 'not-an-enum'},
        {'south': 11.9, 'north': 12.0, 'west': 79.8},
    ):
        result = client.get('/api/map/incidents', params=params)
        assert result.status_code == 422, result.text


def test_sample_dataset_renders_all_36_synthetic_map_points(client):
    from pathlib import Path
    sample = Path(__file__).resolve().parents[2] / 'data' / 'synthetic_incidents.csv'
    import csv
    with sample.open(newline='', encoding='utf-8') as handle:
        entries = list(csv.DictReader(handle))
    # The seed CSV has stable IDs, which are intentionally not part of the public create schema.
    cleaned = [{k: v for k, v in entry.items() if k != 'id'} for entry in entries]
    import json
    response = client.post('/api/incidents/import', files={'file': ('demo.json', json.dumps(cleaned), 'application/json')})
    assert response.status_code == 201, response.text
    assert response.json()['imported'] == 36
    visible = client.get('/api/map/incidents', params=PUDUCHERRY)
    assert visible.status_code == 200, visible.text
    assert visible.json()['meta']['total'] == 36
    assert len(visible.json()['features']) == 36
    assert all(f['properties']['source_type'] == 'synthetic' for f in visible.json()['features'])
