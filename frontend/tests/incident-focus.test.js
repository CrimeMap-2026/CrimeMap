import test from 'node:test';
import assert from 'node:assert/strict';

import {
  incidentMapFocus,
  focusedIncidentFeature,
} from '../src/modules/map/incident-focus.js';

const INCIDENT = {
  id: 'DEMO-0104', category: 'Theft', status: 'reported',
  occurred_at: '2026-10-02T05:30:00Z', latitude: 11.934234,
  longitude: 79.830345, police_station: 'Demo Zone A',
  description: 'Synthetic incident, not a police report',
  source_type: 'synthetic',
};

test('incident registry focus keeps exact ID, lat/lon and synthetic popup fields', () => {
  const focus = incidentMapFocus(INCIDENT);
  assert.deepEqual(focus, {
    id: INCIDENT.id,
    latitude: 11.934234,
    longitude: 79.830345,
    category: 'Theft',
    occurred_at: INCIDENT.occurred_at,
    police_station: 'Demo Zone A',
    description: INCIDENT.description,
    status: 'reported',
  });
  const feature = focusedIncidentFeature(focus);
  assert.equal(feature.id, INCIDENT.id);
  assert.equal(feature.geometry.type, 'Point');
  assert.deepEqual(feature.geometry.coordinates, [79.830345, 11.934234]);
  assert.equal(feature.properties.source_type, 'synthetic');
  assert.equal(feature.properties.description, INCIDENT.description);
  assert.deepEqual(INCIDENT, {
    id: 'DEMO-0104', category: 'Theft', status: 'reported',
    occurred_at: '2026-10-02T05:30:00Z', latitude: 11.934234,
    longitude: 79.830345, police_station: 'Demo Zone A',
    description: 'Synthetic incident, not a police report',
    source_type: 'synthetic',
  });
});

test('registry focus rejects invalid IDs and coordinates rather than silently moving', () => {
  for (const incident of [
    null, {}, { ...INCIDENT, id: '' }, { ...INCIDENT, id: null },
    { ...INCIDENT, latitude: null }, { ...INCIDENT, longitude: '79.83' },
    { ...INCIDENT, latitude: NaN }, { ...INCIDENT, longitude: Infinity },
    { ...INCIDENT, latitude: -91 }, { ...INCIDENT, longitude: 180.01 },
  ]) {
    assert.equal(incidentMapFocus(incident), null);
  }
});

test('registry focus permits boundary coordinates and imported UUID IDs', () => {
  const focus = incidentMapFocus({
    ...INCIDENT, id: 'bd769f54-09ed-4a72-9617-fef74818db80',
    latitude: 0, longitude: -180,
  });
  assert.equal(focus.latitude, 0);
  assert.equal(focus.longitude, -180);
  assert.equal(focus.id, 'bd769f54-09ed-4a72-9617-fef74818db80');
  assert.deepEqual(focusedIncidentFeature(focus).geometry.coordinates, [-180, 0]);
});
