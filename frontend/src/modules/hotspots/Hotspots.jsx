import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Download, Grid2X2, RotateCcw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { fetchAnalyticsFilters, fetchHotspots, STATUSES } from '../../api';
import './hotspots.css';

const DEFAULT_FILTERS = {
  start_date: '', end_date: '', category: '', status: '', zone: '', cell_size_m: '1000', min_count: '3',
};
const CENTER = [11.935, 79.83];
const count = value => value.toLocaleString('en-IN');
const statusName = value => STATUSES.find(([key]) => key === value)?.[1] || value;
// Fixed count ranges retain their meaning when filters change. These are not risk classes.
const colorForCount = value => value >= 10 ? '#bf5f96' : value >= 5 ? '#dbaa5e' : '#68b9cf';

function cellPopup(properties) {
  const root = document.createElement('div');
  root.className = 'hotspot-popup';
  const title = document.createElement('strong');
  title.textContent = `Cell ${properties.cell_id}`;
  root.append(title);
  for (const value of [
    `Count rank: ${properties.rank} (equal counts share a rank)`,
    `${count(properties.count)} synthetic incidents`,
    `${count(properties.density_per_km2)} incidents per nominal km²`,
    'SYNTHETIC DEMONSTRATION DATA',
  ]) {
    const line = document.createElement('div');
    line.textContent = value;
    root.append(line);
  }
  return root;
}

function HotspotMap({ data, loading, error, selected, onSelect, fitVersion }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const polygons = useRef(new Map());
  const overlay = useRef(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    const map = L.map(container.current, { center: CENTER, zoom: 13, zoomControl: false });
    mapRef.current = map;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      tiles.off();
      polygons.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    polygons.current.clear();
    overlay.current = null;
    if (!data) return;
    const { south, west, north, east } = data.meta.study_bounds;
    const boundary = L.rectangle([[south, west], [north, east]], {
      color: '#7691b1', weight: 1.5, dashArray: '7 6', fill: false, interactive: false,
    }).addTo(map);
    const cells = L.geoJSON(data, {
      style: feature => ({ color: colorForCount(feature.properties.count), weight: 2, fillOpacity: 0.48 }),
      onEachFeature(feature, layer) {
        polygons.current.set(feature.properties.cell_id, layer);
        layer.bindPopup(cellPopup(feature.properties));
        layer.on('click', () => onSelect(feature.properties.cell_id));
      },
    }).addTo(map);
    overlay.current = cells;
    return () => {
      map.removeLayer(boundary);
      map.removeLayer(cells);
      polygons.current.clear();
      overlay.current = null;
    };
  }, [data, onSelect]);

  useEffect(() => {
    const cells = overlay.current;
    if (!cells) return;
    cells.eachLayer(layer => layer.setStyle({
      weight: layer.feature.properties.cell_id === selected ? 4 : 2,
      fillOpacity: layer.feature.properties.cell_id === selected ? 0.7 : 0.48,
    }));
    const selectedLayer = polygons.current.get(selected);
    if (selectedLayer) {
      mapRef.current.fitBounds(selectedLayer.getBounds(), { padding: [50, 50], maxZoom: 15, animate: false });
      selectedLayer.openPopup();
    }
  }, [selected, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const bounds = overlay.current?.getBounds();
    if (bounds?.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
    else map.setView(CENTER, 12, { animate: false });
  }, [data, fitVersion]);

  return <div className="hotspot-map-frame">
    <div className="hotspot-map-canvas" ref={container} aria-label="Synthetic concentration grid map near Puducherry" />
    <div className="hotspot-map-status" role="status">{loading ? 'Computing synthetic cell counts…' : error ? 'Grid data unavailable' : data ? `${count(data.meta.qualifying_cells)} cells meet the threshold` : 'Apply valid filters to show cells'}</div>
    <div className="hotspot-map-legend"><strong>Synthetic incidents per cell</strong>
      <span><i style={{ background: colorForCount(1) }} /> 1–4 <i style={{ background: colorForCount(5) }} /> 5–9 <i style={{ background: colorForCount(10) }} /> 10+</span>
      <small>Only cells meeting the count threshold are shown. Dashed outline: demonstration study extent.</small>
    </div>
    {tileError && <div className="hotspot-tile-warning" role="status">Some basemap tiles could not load. Cell counts and the ranked list remain available.</div>}
  </div>;
}

export default function Hotspots({ refresh = 0 }) {
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(null);
  const [fitVersion, setFitVersion] = useState(0);
  const pendingChanges = JSON.stringify(draft) !== JSON.stringify(filters);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    setSelected(null);
    const query = { ...filters };
    if (filters.zone) {
      const zone = JSON.parse(filters.zone);
      query.zone = zone ?? '';
      if (zone === null) query.unspecified_zone = 'true';
    }
    Promise.all([fetchHotspots(query, controller.signal), fetchAnalyticsFilters(controller.signal)])
      .then(([result, available]) => {
        if (controller.signal.aborted) return;
        setData(result);
        setOptions(available);
        setLoading(false);
      }).catch(reason => {
        if (controller.signal.aborted) return;
        setError(reason.message || 'Hotspot analysis could not be loaded.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [filters, refresh, retry]);

  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  function apply(event) {
    event.preventDefault();
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
      setValidation('From date must be on or before To date.');
      return;
    }
    if (!Number.isInteger(Number(draft.min_count)) || Number(draft.min_count) < 2 || Number(draft.min_count) > 1000) {
      setValidation('Minimum incidents per cell must be a whole number from 2 to 1,000.');
      return;
    }
    setValidation('');
    setFilters({ ...draft });
  }

  function reset() {
    setDraft(DEFAULT_FILTERS);
    setFilters({ ...DEFAULT_FILTERS });
    setValidation('');
  }

  function download() {
    const blob = new Blob([JSON.stringify({ ...data, applied_filters: filters }, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crimemap-synthetic-grid.geojson';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const meta = data?.meta;
  return <div className="hotspots-page">
    <div className="heading-row"><div><div className="eyebrow">MODULE 04 · SPATIAL CONCENTRATION</div>
      <h1>Hotspot exploration</h1><p className="intro">Explore synthetic incident concentrations with a transparent grid-count method.</p>
    </div><button type="button" className="button subtle" disabled={loading} onClick={() => setRetry(value => value + 1)}><RotateCcw size={16} /> Refresh</button></div>
    <div className="demo-warning"><ShieldAlert size={19} /><div><strong>SYNTHETIC DEMONSTRATION DATA</strong><span>Highlighted cells contain fictional incidents above a chosen count threshold. They are not verified crime hotspots, statistically significant clusters, or forecasts.</span></div></div>

    <form className="panel hotspot-filters" onSubmit={apply} aria-label="Hotspot filters" noValidate>
      <div className="hotspot-field"><label htmlFor="hotspot-from">From date (IST)</label><input id="hotspot-from" type="date" value={draft.start_date} onChange={e => change('start_date', e.target.value)} /></div>
      <div className="hotspot-field"><label htmlFor="hotspot-to">To date (IST)</label><input id="hotspot-to" type="date" value={draft.end_date} onChange={e => change('end_date', e.target.value)} /></div>
      <div className="hotspot-field"><label htmlFor="hotspot-category">Crime category</label><select id="hotspot-category" value={draft.category} onChange={e => change('category', e.target.value)}><option value="">All categories</option>{options?.categories.map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="hotspot-field"><label htmlFor="hotspot-status">Investigation status</label><select id="hotspot-status" value={draft.status} onChange={e => change('status', e.target.value)}><option value="">All statuses</option>{options?.statuses.map(value => <option value={value} key={value}>{statusName(value)}</option>)}</select></div>
      <div className="hotspot-field"><label htmlFor="hotspot-zone">Demonstration zone</label><select id="hotspot-zone" value={draft.zone} onChange={e => change('zone', e.target.value)}><option value="">All zones</option>{options?.zones.map(value => <option key={value} value={JSON.stringify(value)}>{value}</option>)}{options?.has_unspecified_zone && <option value="null">Unspecified zone</option>}</select></div>
      <div className="hotspot-field"><label htmlFor="hotspot-size">Cell width (approx.)</label><select id="hotspot-size" value={draft.cell_size_m} onChange={e => change('cell_size_m', e.target.value)}>{[250, 500, 1000, 2000, 5000].map(value => <option key={value} value={value}>{value < 1000 ? `${value} m` : `${value / 1000} km`}</option>)}</select></div>
      <div className="hotspot-field"><label htmlFor="hotspot-min">Minimum incidents per cell</label><input id="hotspot-min" type="number" min="2" max="1000" step="1" required value={draft.min_count} onChange={e => change('min_count', e.target.value)} /></div>
      <div className="hotspot-filter-actions"><button type="submit" className="button primary" disabled={loading}><SlidersHorizontal size={16} /> Apply filters</button><button type="button" className="button subtle" onClick={reset}>Reset</button></div>
      <p className="hotspot-filter-note">Dates include whole days in Asia/Kolkata. Blank dates mean all time. Panning the map does not change the study extent or counts.</p>
      {pendingChanges && <p className="hotspot-pending" role="status">Filter changes are not applied yet. Results still use the last applied filters.</p>}
      {validation && <p className="hotspot-validation" role="alert">{validation}</p>}
    </form>

    {error && <div className="notice error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p className="hotspot-loading" role="status">Computing synthetic concentrations…</p>}
      {meta && <section className="stats-grid hotspot-stats" aria-label="Synthetic grid summary">
        <div className="stat"><div className="stat-top"><span>Matching incidents</span></div><strong>{count(meta.total_matching_incidents)}</strong><small>{count(meta.analyzed_incidents)} inside the study extent</small></div>
        <div className="stat"><div className="stat-top"><span>Cells meeting threshold</span><Grid2X2 size={18} /></div><strong>{count(meta.qualifying_cells)}</strong><small>Of {count(meta.occupied_cells)} occupied cells · minimum {meta.min_count}</small></div>
        <div className="stat"><div className="stat-top"><span>Incidents in highlighted cells</span></div><strong>{count(meta.incidents_in_qualifying_cells)}</strong><small>Each analyzed incident belongs to one cell</small></div>
        <div className="stat"><div className="stat-top"><span>Largest cell count</span></div><strong>{count(meta.max_cell_count)}</strong><small>Across all occupied {meta.cell_size_m} m cells</small></div>
      </section>}
      {meta?.excluded_incidents > 0 && <div className="demo-warning"><ShieldAlert size={18} /><div><strong>{count(meta.excluded_incidents)} matching incidents are outside the study extent</strong><span>They are excluded from grid counts. This rectangular demonstration extent is not the official Puducherry boundary.</span></div></div>}
    </div>

    <section className="panel hotspot-results" aria-label="Synthetic grid results">
      <div className="panel-heading"><div><h2>Synthetic concentration map</h2><p>{meta ? `${meta.cell_size_m} m cells · minimum ${meta.min_count} incidents · ${count(meta.analyzed_incidents)} records analyzed` : 'Waiting for valid analysis results'}</p></div>
        <div className="hotspot-map-actions"><button type="button" className="button subtle" disabled={!data?.features.length} onClick={() => { setSelected(null); setFitVersion(value => value + 1); }}><Crosshair size={15} /> Fit cells</button><button type="button" className="button subtle" disabled={!data || loading} onClick={download}><Download size={15} /> GeoJSON</button></div>
      </div>
      <div className="hotspot-layout">
        <HotspotMap data={data} loading={loading} error={error} selected={selected} onSelect={setSelected} fitVersion={fitVersion} />
        <aside className="hotspot-rankings" aria-label="Ranked synthetic cells">
          <h2>Cells by incident count</h2><p>Equal counts share a rank. Select a cell to locate it. Rankings do not indicate crime risk.</p>
          {loading && <p role="status">Loading cell counts…</p>}
          {!loading && error && <p>Results are unavailable. Retry the analysis above.</p>}
          {meta && data.features.length === 0 && <div className="hotspot-empty" role="status"><strong>{meta.analyzed_incidents === 0 ? 'No incidents to analyze' : 'No cells meet this threshold'}</strong><p>{meta.analyzed_incidents === 0 ? 'Change the filters or check the study extent.' : 'Try a lower minimum count or a different cell width. An empty result does not imply a safe area.'}</p></div>}
          <div className="hotspot-cell-list">{data?.features.map(feature => <button type="button" key={feature.properties.cell_id} className={`hotspot-cell ${selected === feature.properties.cell_id ? 'selected' : ''}`} aria-pressed={selected === feature.properties.cell_id} onClick={() => setSelected(feature.properties.cell_id)}>
            <span className="hotspot-cell-top"><span className="hotspot-rank">#{feature.properties.rank}</span><strong>{count(feature.properties.count)} incidents</strong><i style={{ background: colorForCount(feature.properties.count) }} /></span>
            <span className="hotspot-cell-id">Cell {feature.properties.cell_id}</span><span>{count(feature.properties.density_per_km2)} per nominal km²</span>
          </button>)}</div>
        </aside>
      </div>
      <div className="hotspot-result-label">SYNTHETIC DEMONSTRATION DATA · Basemap © OpenStreetMap contributors · Internet access is required for map tiles.</div>
    </section>

    <details className="panel hotspot-method" open><summary>How to interpret this demonstration</summary><div>
      <p>Each matching incident inside the study extent is assigned to one fixed square grid cell. A cell is highlighted when its count reaches the selected minimum; adjacent cells are not merged. Counts are calculated on the backend across all matching records.</p>
      <p>Changing the cell width or grid boundaries can change the apparent concentrations. Density is count divided by the nominal cell area, using a local distance approximation. It is not adjusted for population, reporting rates, or exposure, and no statistical significance test is performed.</p>
      <p>The demonstration extent is {meta ? `${meta.study_bounds.south}–${meta.study_bounds.north}° N, ${meta.study_bounds.west}–${meta.study_bounds.east}° E` : 'a fixed rectangle around the bundled Puducherry sample'}. It is not an administrative boundary. Edge cells retain their full square area even if part lies outside the extent; only incidents inside the extent are counted.</p>
      <p>No highlighted cells means no cell met the chosen settings. It does not establish that any place is safe or unsafe.</p>
    </div></details>
  </div>;
}
