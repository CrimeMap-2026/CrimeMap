import test from 'node:test';
import assert from 'node:assert/strict';

import { validIncidentPageOffset } from '../src/modules/incidents/pagination-utils.js';

test('registry stays on its current page when results still exist', () => {
  assert.equal(validIncidentPageOffset(0, 10, 200), 0);
  assert.equal(validIncidentPageOffset(30, 10, 34), 30);
  assert.equal(validIncidentPageOffset(190, 10, 200), 190);
});

test('deleting the last record of a page moves back to the nearest valid page', () => {
  assert.equal(validIncidentPageOffset(20, 10, 20), 10);
  assert.equal(validIncidentPageOffset(190, 10, 101), 100);
  assert.equal(validIncidentPageOffset(10, 10, 0), 0);
  assert.equal(validIncidentPageOffset(10, 10, 1), 0);
});

test('rejects invalid paging input rather than producing a negative offset', () => {
  for (const input of [
    [-1, 10, 50], [10, 0, 50], [10, 10, -1], [NaN, 10, 3],
    [Infinity, 10, 30], [10, 1.5, 30],
  ]) assert.equal(validIncidentPageOffset(...input), 0);
});
