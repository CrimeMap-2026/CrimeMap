/** Settings for a single report assembled from the existing three workspaces. */
export const REPORT_SECTIONS = Object.freeze([
  ['analytics', 'Incident analytics'],
  ['spatial', 'Fixed-grid geographic findings'],
  ['prevention', 'Saved prevention plans'],
]);

export function presentationReportQuery(filters, sections, cellSize, minCount) {
  const chosen = REPORT_SECTIONS.map(([key]) => key).filter(key => sections[key]);
  if (!chosen.length) throw new Error('Choose at least one report section.');
  const size = Number(cellSize);
  const minimum = Number(minCount);
  if (chosen.includes('spatial') && (!Number.isInteger(size) || size < 250 || size > 5000 ||
      !Number.isInteger(minimum) || minimum < 2 || minimum > 1000)) {
    throw new Error('Choose a valid grid cell width (250–5000 m) and threshold (2–1000).');
  }
  if (filters.start_date && filters.end_date && filters.start_date > filters.end_date) {
    throw new Error('From date must be on or before To date.');
  }
  const query = {};
  for (const key of ['start_date', 'end_date', 'category', 'status']) {
    if (filters[key]) query[key] = filters[key];
  }
  if (filters.zone) {
    const zone = JSON.parse(filters.zone);
    if (zone === null) query.unspecified_zone = 'true';
    else query.zone = zone;
  }
  query.sections = chosen.join(',');
  if (chosen.includes('spatial')) {
    query.cell_size_m = String(size);
    query.min_count = String(minimum);
  }
  return query;
}
