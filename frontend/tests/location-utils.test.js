import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_ZONE_REFERENCES, DEMO_ZONE_MAX_DISTANCE_METERS,
  validIncidentPosition, suggestDemoZone, locationFieldsForPin,
} from '../src/modules/incidents/location-utils.js';

test('explicit finite map positions are accepted, including zero', () => {
  assert.equal(validIncidentPosition(11.9345, 79.8302), true);
  assert.equal(validIncidentPosition(0, 0), true);
  assert.equal(validIncidentPosition(-90, -180), true);
  assert.equal(validIncidentPosition(90, 180), true);
});

test('missing, coerced or out-of-range coordinates cannot be saved', () => {
  for (const [latitude, longitude] of [
    [null, null], [undefined, undefined], ['', ''],
    ['11.93', '79.83'], [NaN, 79.83], [Infinity, 79.83],
    [11.93, -Infinity], [90.1, 70], [-90.1, 70],
    [11.93, 180.1], [11.93, -180.1],
  ]) {
    assert.equal(validIncidentPosition(latitude, longitude), false, JSON.stringify([latitude, longitude]));
  }
});


test('pin placement suggests the nearest of four fictional demonstration zones', () => {
  assert.equal(DEMO_ZONE_REFERENCES.length, 4);
  assert.equal(DEMO_ZONE_MAX_DISTANCE_METERS, 3500);
  for (const ref of DEMO_ZONE_REFERENCES) {
    assert.equal(suggestDemoZone(ref.latitude, ref.longitude), ref.name);
  }
  assert.equal(suggestDemoZone(11.935, 79.83), 'Demo Zone A');
  assert.equal(suggestDemoZone(11.944, 79.842), 'Demo Zone D');
});

test('no zone is guessed for missing, invalid, or distant coordinates', () => {
  for (const coordinates of [
    [null, null], ['11.935', '79.83'], [Number.NaN, 79.83],
    [11.935, 181], [0, 0], [12.15, 79.83], [11.935, 80.2],
  ]) {
    assert.equal(suggestDemoZone(...coordinates), '', String(coordinates));
  }
});

test('every new pin position replaces the previous demo zone and preserves other fields', () => {
  const previous = {
    category: 'Theft', status: 'reported', description: 'Synthetic example',
    latitude: null, longitude: null, police_station: '',
  };
  const zoneA = locationFieldsForPin(previous, 11.9332, 79.8299);
  assert.equal(zoneA.police_station, 'Demo Zone A');
  const edited = { ...zoneA, police_station: 'My manual demonstration zone' };
  const zoneB = locationFieldsForPin(edited, 11.9509, 79.8196);
  assert.equal(zoneB.police_station, 'Demo Zone B');
  assert.equal(zoneB.category, 'Theft');
  assert.equal(zoneB.description, previous.description);
  assert.deepEqual(previous, {
    category: 'Theft', status: 'reported', description: 'Synthetic example',
    latitude: null, longitude: null, police_station: '',
  });
});

test('moving outside demo coverage clears the zone; clearing pin removes stale values', () => {
  const selected = locationFieldsForPin({ category: 'Other', police_station: 'old' }, 11.9195, 79.8039);
  assert.equal(selected.police_station, 'Demo Zone C');
  const distant = locationFieldsForPin(selected, 12.15, 79.83);
  assert.equal(distant.police_station, '');
  assert.equal(distant.latitude, 12.15);
  const cleared = locationFieldsForPin(
    { ...selected, police_station: 'Manually edited zone' }, null, null,
  );
  assert.equal(cleared.latitude, null);
  assert.equal(cleared.longitude, null);
  assert.equal(cleared.police_station, '');
});
