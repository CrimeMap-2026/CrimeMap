import test from 'node:test';
import assert from 'node:assert/strict';

import { presentationReportQuery, REPORT_SECTIONS } from
  '../src/modules/analytics/report-options.js';

const FILTERS = {
  start_date: '2026-09-01', end_date: '2026-10-10', category: 'Theft',
  status: 'reported', zone: JSON.stringify('Demo Zone A'),
};

test('consolidated report includes the selected sections once and shares incident filters', () => {
  const query = presentationReportQuery(FILTERS, {
    analytics: true, spatial: true, prevention: true,
  }, '1000', '2');
  assert.equal(query.sections, 'analytics,spatial,prevention');
  assert.equal(query.start_date, '2026-09-01');
  assert.equal(query.end_date, '2026-10-10');
  assert.equal(query.category, 'Theft');
  assert.equal(query.status, 'reported');
  assert.equal(query.zone, 'Demo Zone A');
  assert.equal(query.cell_size_m, '1000');
  assert.equal(query.min_count, '2');
  assert.equal(REPORT_SECTIONS.length, 3);
});

test('missing zone is distinct from a named zone, and single-section export omits grid settings', () => {
  const result = presentationReportQuery({
    ...FILTERS, zone: 'null', status: '',
  }, { analytics: false, spatial: false, prevention: true }, '1000', '2');
  assert.equal(result.unspecified_zone, 'true');
  assert.ok(!('zone' in result));
  assert.ok(!('status' in result));
  assert.ok(!('min_count' in result));
  assert.equal(result.sections, 'prevention');
});

test('prevents empty reports, invalid grid settings and invalid date windows', () => {
  assert.throws(() => presentationReportQuery(FILTERS, {
    analytics: false, spatial: false, prevention: false,
  }, '1000', '2'), /Choose at least one/);
  for (const [width, minimum] of [['200','2'],['1000','1'],['wat','2'],['1000','3.5']]) {
    assert.throws(() => presentationReportQuery(FILTERS,
      { analytics: false, spatial: true, prevention: false },
      width, minimum), /valid grid/);
  }
  assert.throws(() => presentationReportQuery({
    ...FILTERS, start_date: '2026-10-11', end_date: '2026-10-10',
  }, { analytics: true }, '1000', '2'), /From date/);
});

test('an unfiltered report does not send empty string filters', () => {
  const query = presentationReportQuery({
    start_date: '', end_date: '', category: '', status: '', zone: '',
  }, { analytics: true, spatial: false, prevention: true }, '1000', '2');
  assert.deepEqual(query, { sections: 'analytics,prevention' });
});
