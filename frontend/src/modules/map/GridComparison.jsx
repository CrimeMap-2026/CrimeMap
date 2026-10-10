import { Crosshair, Download, RotateCcw, SlidersHorizontal } from 'lucide-react';

export const DEFAULT_COMPARISON = {
  previous_start_date: '2026-07-01',
  previous_end_date: '2026-08-15',
  current_start_date: '2026-08-16',
  current_end_date: '2026-09-30',
  zone: '', cell_size_m: '1000', min_count: '2',
};

export const COMPARISON_LABELS = {
  newly_above_threshold: 'Newly above threshold',
  persistently_above_threshold: 'Above threshold in both',
  fell_below_threshold: 'Fell below threshold',
};
export const COMPARISON_COLORS = {
  newly_above_threshold: '#71c4db',
  persistently_above_threshold: '#bb94ed',
  fell_below_threshold: '#e5b66a',
};
const number = value => Number(value || 0).toLocaleString('en-IN');

export function GridCompareForm({
  draft, setDraft, onSubmit, onReset, options, pending, validation,
}) {
  const change = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  return <form className="panel grid-filters grid-compare-filters"
    aria-label="Compare two grid-analysis periods" onSubmit={onSubmit} noValidate>
    <div className="grid-compare-section-name">Previous period (IST)</div>
    <div className="grid-field"><label htmlFor="compare-prev-start">Start</label>
      <input id="compare-prev-start" type="date" required value={draft.previous_start_date}
        onChange={e => change('previous_start_date', e.target.value)} /></div>
    <div className="grid-field"><label htmlFor="compare-prev-end">End</label>
      <input id="compare-prev-end" type="date" required value={draft.previous_end_date}
        onChange={e => change('previous_end_date', e.target.value)} /></div>
    <div className="grid-compare-section-name">Current period (IST)</div>
    <div className="grid-field"><label htmlFor="compare-curr-start">Start</label>
      <input id="compare-curr-start" type="date" required value={draft.current_start_date}
        onChange={e => change('current_start_date', e.target.value)} /></div>
    <div className="grid-field"><label htmlFor="compare-curr-end">End</label>
      <input id="compare-curr-end" type="date" required value={draft.current_end_date}
        onChange={e => change('current_end_date', e.target.value)} /></div>
    <div className="grid-compare-section-name">Shared grid settings</div>
    <div className="grid-field"><label htmlFor="compare-zone">Demonstration zone</label>
      <select id="compare-zone" value={draft.zone} onChange={e => change('zone', e.target.value)}>
        <option value="">All zones</option>
        {options?.zones.map(zone => <option key={zone} value={JSON.stringify(zone)}>{zone}</option>)}
        {options?.has_unspecified_zone && <option value="null">Unspecified zone</option>}
      </select></div>
    <div className="grid-field"><label htmlFor="compare-size">Cell width</label>
      <select id="compare-size" value={draft.cell_size_m} onChange={e => change('cell_size_m', e.target.value)}>
        {[250, 500, 1000, 2000, 5000].map(size => <option key={size} value={size}>{size < 1000 ? size + ' m' : size / 1000 + ' km'}</option>)}
      </select></div>
    <div className="grid-field"><label htmlFor="compare-min">Minimum incidents per cell</label>
      <input id="compare-min" type="number" min="2" max="1000" step="1" required
        value={draft.min_count} onChange={e => change('min_count', e.target.value)} /></div>
    <div className="grid-actions">
      <button className="button primary" type="submit"><SlidersHorizontal size={17} /> Compare periods</button>
      <button className="button subtle" type="button" onClick={onReset}><RotateCcw size={16} /> Reset periods</button>
    </div>
    <p className="grid-help">Both periods must be non-overlapping, ordered and equally long (maximum 366 days). Category and status above, plus these cell settings, apply identically to both. These example dates are for fictional demonstration records.</p>
    {pending && <p role="status" className="grid-pending">Date or grid filter changes haven't been applied yet.</p>}
    {validation && <p className="grid-error" role="alert">{validation}</p>}
  </form>;
}

export function ComparisonLegend() {
  return <div className="grid-legend">
    {Object.entries(COMPARISON_LABELS).map(([key, label]) =>
      <span key={key}><i style={{ background: COMPARISON_COLORS[key] }} />{label}</span>)}
    <small>Cells meeting the chosen count threshold in at least one period. No statistically validated hotspots or risk predictions.</small>
  </div>;
}

export function CompareSidebar({
  data, loading, error, selectedCell, onSelectCell, onFit, onDownload, onRetry,
}) {
  return <>
    <div className="map-results-heading"><h2>Period comparison</h2><span>{data?.meta.displayed_cells ?? '—'}</span></div>
    <p>Fictional incident counts in aligned geographic cells.</p>
    <div className="grid-side-actions">
      <button type="button" className="button subtle" disabled={!data?.features.length} onClick={onFit}><Crosshair size={16} /> Fit cells</button>
      <button type="button" className="button subtle" disabled={!data || loading} onClick={onDownload}><Download size={16} /> GeoJSON</button>
    </div>
    {loading && <div className="map-results-empty" role="status">Comparing both synthetic periods…</div>}
    {error && <div className="map-data-error" role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></div>}
    {data && <><div className="grid-summary">
      <strong>{number(data.meta.period_days)} days per period</strong>
      <span>Previous: {data.meta.previous_start_date} to {data.meta.previous_end_date}</span>
      <span>Current: {data.meta.current_start_date} to {data.meta.current_end_date}</span>
      <span>Previous: {number(data.meta.analyzed_previous)} in study extent ({number(data.meta.excluded_previous)} excluded)</span>
      <span>Current: {number(data.meta.analyzed_current)} in study extent ({number(data.meta.excluded_current)} excluded)</span>
      <strong>Cell classifications</strong>
      <span>Newly above threshold: {number(data.meta.cells_newly_above_threshold)}</span>
      <span>Above threshold in both: {number(data.meta.cells_persistently_above_threshold)}</span>
      <span>Fell below threshold: {number(data.meta.cells_fell_below_threshold)}</span>
    </div>
      {data.features.length === 0 && <div className="map-results-empty">
        No cells meet the threshold in either period. Try reducing the threshold or changing the filters; this doesn't indicate safety.
      </div>}
      <div className="map-results-list" aria-label="Cells compared across the two periods">
        {data.features.map(feature => {
          const p = feature.properties;
          return <button type="button" key={p.cell_id}
            className={'grid-cell-item grid-compare-item' + (selectedCell === p.cell_id ? ' selected' : '')}
            aria-pressed={selectedCell === p.cell_id}
            onClick={() => onSelectCell(p.cell_id)}>
            <span className="grid-cell-top"><strong>{COMPARISON_LABELS[p.classification]}</strong>
              <i style={{ background: COMPARISON_COLORS[p.classification] }} /></span>
            <span className="grid-compare-counts">{number(p.previous_count)} → {number(p.current_count)} incidents <b>({p.change > 0 ? '+' : ''}{p.change})</b></span>
            <span className="mono">{p.cell_id}</span>
          </button>;
        })}
      </div>
    </>}
  </>;
}
