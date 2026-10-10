/** Shared validation for read-only synthetic before/after plan count reviews. */
export const DEFAULT_REVIEW_PERIODS = Object.freeze({
  previous_start_date: '2026-09-01',
  previous_end_date: '2026-09-10',
  followup_start_date: '2026-10-01',
  followup_end_date: '2026-10-10',
});

function daysBetween(start, end) {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(start || '') || !pattern.test(end || '')) return NaN;
  const first = Date.parse(start + 'T00:00:00Z');
  const last = Date.parse(end + 'T00:00:00Z');
  if (!Number.isFinite(first) || !Number.isFinite(last)) return NaN;
  // Date.parse normalizes some malformed dates; disallow those.
  if (new Date(first).toISOString().slice(0, 10) !== start ||
      new Date(last).toISOString().slice(0, 10) !== end) return NaN;
  return Math.round((last - first) / 86400000) + 1;
}

export function reviewPeriodError(periods) {
  if (!periods || Object.values(periods).some(value => !value)) {
    return 'Choose all four dates before reviewing counts.';
  }
  const prev = daysBetween(periods.previous_start_date, periods.previous_end_date);
  const later = daysBetween(periods.followup_start_date, periods.followup_end_date);
  if (!Number.isFinite(prev) || !Number.isFinite(later) || prev < 1 || later < 1 ||
      periods.previous_end_date >= periods.followup_start_date || prev !== later || prev > 366) {
    return 'Choose an earlier period and a later non-overlapping period with the same length (1–366 days each).';
  }
  return '';
}
