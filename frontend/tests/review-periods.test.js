import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_REVIEW_PERIODS, reviewPeriodError,
} from '../src/modules/prevention/review-periods.js';

test('default sample date windows are both valid and have the same duration', () => {
  assert.deepEqual(DEFAULT_REVIEW_PERIODS, {
    previous_start_date: '2026-09-01', previous_end_date: '2026-09-10',
    followup_start_date: '2026-10-01', followup_end_date: '2026-10-10',
  });
  assert.equal(reviewPeriodError(DEFAULT_REVIEW_PERIODS), '');
});

test('requires all four dates and ordered nonoverlapping equal periods', () => {
  for (const override of [
    { previous_start_date: '' },
    { previous_end_date: '2026-08-31' },
    { followup_end_date: '2026-10-11' },
    { followup_start_date: '2026-09-08', followup_end_date: '2026-09-17' },
    { previous_start_date: '2026-11-01', previous_end_date: '2026-11-10' },
    { followup_start_date: '2026-10-11', followup_end_date: '2026-10-10' },
    { previous_start_date: '2026-13-01' },
    { previous_start_date: '2026-02-30' },
    { previous_start_date: '2024-01-01', previous_end_date: '2025-01-02',
      followup_start_date: '2025-02-01', followup_end_date: '2026-02-02' },
  ]) {
    assert.ok(reviewPeriodError({ ...DEFAULT_REVIEW_PERIODS, ...override }),
      'expected validation error for: ' + JSON.stringify(override));
  }
});

test('accepts valid one-day windows and leap-day intervals', () => {
  assert.equal(reviewPeriodError({
    previous_start_date: '2024-02-29', previous_end_date: '2024-02-29',
    followup_start_date: '2024-03-01', followup_end_date: '2024-03-01',
  }), '');
  assert.equal(reviewPeriodError({
    previous_start_date: '2024-01-01', previous_end_date: '2024-12-31',
    followup_start_date: '2025-01-01', followup_end_date: '2025-12-31',
  }), 'Choose an earlier period and a later non-overlapping period with the same length (1–366 days each).');
});

test('rejects empty review objects gracefully', () => {
  assert.ok(reviewPeriodError(null));
});
