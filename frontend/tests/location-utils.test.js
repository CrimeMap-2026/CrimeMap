import test from 'node:test';
import assert from 'node:assert/strict';
import { validIncidentPosition } from '../src/modules/incidents/location-utils.js';

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
