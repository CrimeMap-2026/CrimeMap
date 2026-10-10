import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Crosshair, Download, Grid2X2, Layers, MapPinned, RotateCcw, ShieldAlert, SlidersHorizontal, RadioTower } from 'lucide-react';
import { CATEGORIES, STATUSES, fetchAnalyticsFilters, fetchHotspots, fetchGridComparison, fetchMapIncidents, fetchOperations } from '../../api';
import { DEFAULT_OPERATION_LAYERS, drawOperationalLayers, OperationsControls, OperationsResults } from './OperationalMode.jsx';
import {
  CompareSidebar, ComparisonLegend, COMPARISON_COLORS, COMPARISON_LABELS,
  DEFAULT_COMPARISON, GridCompareForm,
} from './GridComparison.jsx';
import { focusedIncidentFeature } from './incident-focus.js';
import './map.css';

const DEFAULT_GRID = { start_date: '', end_date: '', zone: '', cell_size_m: '1000', min_count: '3' };
const count = value => Number(value || 0).toLocaleString('en-IN');
const colorForCount = value => value >= 10 ? '#bf5f96' : value >= 5 ? '#dbaa5e' : '#68b9cf';

// Fixed count bands are descriptive, not risk scores.
function cellPopup(properties) {
  const root = document.createElement('div');
  root.className = 'crime-popup';
  const heading = document.createElement('strong');
  heading.textContent = 'Grid cell ' + properties.cell_id;
  root.append(heading);
  for (const line of [
    'Rank: ' + properties.rank + ' (ties share a rank)',
    count(properties.count) + ' synthetic incidents',
    count(properties.density_per_km2) + ' incidents per nominal km²',
    'Synthetic demonstration only — not a risk prediction',
  ]) {
    const item = document.createElement('div');
    item.textContent = line;
    root.append(item);
  }
  return root;
}

function comparisonPopup(properties) {
  const root = document.createElement('div');
  root.className = 'crime-popup';
  const heading = document.createElement('strong');
  heading.textContent = 'Compared cell ' + properties.cell_id;
  root.append(heading);
  for (const message of [
    COMPARISON_LABELS[properties.classification],
    'Previous: ' + count(properties.previous_count) + ' fictional incidents',
    'Current: ' + count(properties.current_count) + ' fictional incidents',
    'Count change: ' + (properties.change > 0 ? '+' : '') + properties.change,
    'Descriptive counts only. No forecast or crime-risk estimate.',
  ]) {
    const line = document.createElement('div');
    line.textContent = message;
    root.append(line);
  }
  return root;
}

const CENTER = [11.935, 79.83];
const CATEGORY_KEYS = {
  Theft: 'theft', 'Vehicle Theft': 'vehicle', Burglary: 'burglary', Robbery: 'robbery',
  Assault: 'assault', Cybercrime: 'cybercrime', Vandalism: 'vandalism', Other: 'other',
};
const EMPTY = { type: 'FeatureCollection', features: [], meta: { total: 0, returned: 0, truncated: false } };
const statusName = (value) => STATUSES.find(([id]) => id === value)?.[1] || value;
const formatTime = (value) => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value));

function getViewBounds(map) {
  const bounds = map.getBounds();
  // Bounds of a single viewport; use server spatial queries, not paginated registry records.
  return {
    south: Math.max(-90, bounds.getSouth()),
    west: Math.max(-180, bounds.getWest()),
    north: Math.min(90, bounds.getNorth()),
    east: Math.min(180, bounds.getEast()),
  };
}

function buildPopup(feature) {
  // No user-controlled text is inserted through innerHTML.
  const root = document.createElement('div');
  root.className = 'crime-popup';
  const heading = document.createElement('strong');
  heading.textContent = feature.properties.category;
  root.append(heading);

  const lines = [
    ['Date', formatTime(feature.properties.occurred_at)],
    ['Zone', feature.properties.police_station || 'Not specified'],
    ['Status', statusName(feature.properties.status)],
    ['Notes', feature.properties.description || '—'],
  ];
  for (const [label, value] of lines) {
    const line = document.createElement('div');
    const key = document.createElement('b');
    key.textContent = `${label}: `;
    line.append(key, document.createTextNode(value));
    root.append(line);
  }
  const disclaimer = document.createElement('small');
  disclaimer.textContent = 'SYNTHETIC DEMO · Not a real reported crime';
  root.append(disclaimer);
  return root;
}

export default function CrimeMap({ refresh = 0, canAnalyze = false, focusIncident = null, onClearFocus }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const clusterRef = useRef(null);
  const cellLayers = useRef(new Map());
  const gridLayerRef = useRef(null);
  const patrolMarkersRef = useRef(new Map());
  const [bounds, setBounds] = useState(null);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [layer, setLayer] = useState('markers');
  const [collection, setCollection] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gridView, setGridView] = useState('single');
  const [comparisonDraft, setComparisonDraft] = useState(DEFAULT_COMPARISON);
  const [comparisonApplied, setComparisonApplied] = useState(DEFAULT_COMPARISON);
  const [comparisonData, setComparisonData] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const [comparisonValidation, setComparisonValidation] = useState('');
  const [comparisonRetry, setComparisonRetry] = useState(0);
  const [gridDraft, setGridDraft] = useState(DEFAULT_GRID);
  const [gridApplied, setGridApplied] = useState(DEFAULT_GRID);
  const [gridData, setGridData] = useState(null);
  const [gridOptions, setGridOptions] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState('');
  const [gridValidation, setGridValidation] = useState('');
  const [gridRetry, setGridRetry] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const gridPending = JSON.stringify(gridDraft) !== JSON.stringify(gridApplied);
  const comparisonPending = JSON.stringify(comparisonDraft) !== JSON.stringify(comparisonApplied);
  const activeGridData = gridView === 'compare' ? comparisonData : gridData;
  const [operations, setOperations] = useState(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState('');
  const [opsRetry, setOpsRetry] = useState(0);
  const [opsLayers, setOpsLayers] = useState(DEFAULT_OPERATION_LAYERS);
  const [opsStep, setOpsStep] = useState(0);
  const [selectedOperationIncident, setSelectedOperationIncident] = useState(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    const map = L.map(mapContainer.current, {
      center: CENTER, zoom: 13, zoomControl: false, preferCanvas: true,
    });
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
    const update = () => setBounds(getViewBounds(map));
    map.on('moveend', update);
    update();
    // Avoid rendering against a zero-width map when the layout has just mounted.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(raf);
      map.off('moveend', update);
      markerRefs.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Registry navigation uses the already mounted Leaflet map; no duplicate
  // map, untrusted URL parameters, or extra backend endpoint required.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusIncident) return;
    // Old filters may have hidden the chosen record. Select normal markers.
    setCategory('');
    setStatus('');
    setLayer('markers');
    map.setView([focusIncident.latitude, focusIncident.longitude], 16, { animate: false });

    // A separate non-interactive halo guarantees the selected position remains
    // identifiable even if the viewport marker query is truncated or clustered.
    const halo = L.circleMarker(
      [focusIncident.latitude, focusIncident.longitude],
      { radius: 20, color: '#f5d67d', weight: 4, opacity: 1,
        fillColor: '#f5d67d', fillOpacity: 0.12, interactive: false },
    ).addTo(map);
    // Reuse the exact sanitized DOM popup from ordinary map markers.
    const popup = L.popup({ maxWidth: 310 })
      .setLatLng([focusIncident.latitude, focusIncident.longitude])
      .setContent(buildPopup(focusedIncidentFeature(focusIncident)))
      .openOn(map);

    return () => {
      if (map.hasLayer(halo)) map.removeLayer(halo);
      if (map.hasLayer(popup)) map.removeLayer(popup);
    };
  }, [focusIncident]);

  useEffect(() => {
    if (!bounds || layer === 'grid' || (layer === 'operations' && !opsLayers.incidents)) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchMapIncidents(bounds, { category, status }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setCollection(data);
        setLoading(false);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason.message || 'Map data could not be loaded.');
        setCollection(EMPTY);
        setLoading(false);
      });
    return () => controller.abort();
  }, [bounds, category, status, refresh, layer, opsLayers.incidents]);

  useEffect(() => {
    if (layer !== 'grid' || gridOptions) return;
    const controller = new AbortController();
    fetchAnalyticsFilters(controller.signal)
      .then(options => { if (!controller.signal.aborted) setGridOptions(options); })
      .catch(() => { /* Existing category/status choices remain usable without zone options. */ });
    return () => controller.abort();
  }, [layer, gridOptions]);

  useEffect(() => {
    if (layer !== 'grid' || gridView !== 'single') return;
    const controller = new AbortController();
    setGridLoading(true);
    setGridError('');
    setGridData(null);
    setSelectedCell(null);
    const query = { ...gridApplied, category, status };
    if (gridApplied.zone) {
      const zone = JSON.parse(gridApplied.zone);
      query.zone = zone ?? '';
      if (zone === null) query.unspecified_zone = 'true';
    }
    fetchHotspots(query, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) { setGridData(data); setGridLoading(false); }
      })
      .catch(reason => {
        if (!controller.signal.aborted) {
          setGridError(reason.message || 'Grid analysis could not be loaded.');
          setGridLoading(false);
        }
      });
    return () => controller.abort();
  }, [layer, gridView, gridApplied, category, status, refresh, gridRetry]);

  useEffect(() => {
    if (layer !== 'grid' || gridView !== 'compare') return;
    const controller = new AbortController();
    setComparisonLoading(true);
    setComparisonError('');
    setComparisonData(null);
    setSelectedCell(null);
    const query = { ...comparisonApplied, category, status };
    if (comparisonApplied.zone) {
      const zone = JSON.parse(comparisonApplied.zone);
      query.zone = zone ?? '';
      if (zone === null) query.unspecified_zone = 'true';
    }
    fetchGridComparison(query, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setComparisonData(data);
          setComparisonLoading(false);
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) {
          setComparisonError(reason.message || 'Period comparison could not be loaded.');
          setComparisonLoading(false);
        }
      });
    return () => controller.abort();
  }, [layer, gridView, comparisonApplied, category, status, refresh, comparisonRetry]);

  useEffect(() => {
    if (layer !== 'operations' || operations) return;
    const controller = new AbortController();
    setOpsLoading(true);
    setOpsError('');
    fetchOperations(controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setOperations(data);
        setOpsStep(Math.max(0, data.timeline.steps - 1));
        setOpsLoading(false);
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setOpsError(reason.message || 'Could not load simulated operations data.');
        setOpsLoading(false);
      });
    return () => controller.abort();
  }, [layer, operations, opsRetry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRefs.current.clear();
    clusterRef.current = null;
    cellLayers.current.clear();
    gridLayerRef.current = null;
    patrolMarkersRef.current.clear();
    if (layer === 'operations') {
      const rendered = drawOperationalLayers(map, {
        data: operations, collection, enabled: opsLayers, step: opsStep,
        onSelectIncident: setSelectedOperationIncident,
      });
      patrolMarkersRef.current = rendered.patrolMarkers;
      return () => {
        map.removeLayer(rendered.group);
        patrolMarkersRef.current.clear();
      };
    }
    if (layer === 'grid') {
      if (!activeGridData) return;
      const { south, west, north, east } = activeGridData.meta.study_bounds;
      const boundary = L.rectangle([[south, west], [north, east]], {
        color: '#7691b1', weight: 1.5, dashArray: '7 6', fill: false, interactive: false,
      }).addTo(map);
      const polygons = L.geoJSON(activeGridData, {
        style: feature => ({
          color: gridView === 'compare' ? COMPARISON_COLORS[feature.properties.classification] : colorForCount(feature.properties.count),
          weight: 2,
          fillOpacity: 0.48,
        }),
        onEachFeature(feature, shape) {
          cellLayers.current.set(feature.properties.cell_id, shape);
          shape.bindPopup(gridView === 'compare' ? comparisonPopup(feature.properties) : cellPopup(feature.properties));
          shape.on('click', () => setSelectedCell(feature.properties.cell_id));
        },
      }).addTo(map);
      gridLayerRef.current = polygons;
      return () => {
        map.removeLayer(boundary);
        map.removeLayer(polygons);
        cellLayers.current.clear();
        gridLayerRef.current = null;
      };
    }
    let overlay;
    if (layer === 'heatmap') {
      const points = collection.features.map(({ geometry }) => [
        geometry.coordinates[1], geometry.coordinates[0], 0.7,
      ]);
      overlay = L.heatLayer(points, { radius: 26, blur: 20, maxZoom: 16, minOpacity: 0.28 });
    } else {
      overlay = L.markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true,
        iconCreateFunction(cluster) {
          const count = cluster.getChildCount();
          return L.divIcon({
            className: 'crime-cluster',
            html: `<span>${count}</span>`,
            iconSize: L.point(40, 40), iconAnchor: L.point(20, 20),
          });
        },
      });
      clusterRef.current = overlay;
      for (const feature of collection.features) {
        const { coordinates } = feature.geometry;
        const categoryKey = CATEGORY_KEYS[feature.properties.category] || 'other';
        const icon = L.divIcon({
          className: `crime-pin-wrap cat-${categoryKey}`,
          html: '<span class="crime-pin" aria-hidden="true"></span>',
          iconSize: L.point(22, 22), iconAnchor: L.point(11, 11),
        });
        const marker = L.marker([coordinates[1], coordinates[0]], { icon });
        marker.bindPopup(buildPopup(feature));
        overlay.addLayer(marker);
        markerRefs.current.set(feature.id, marker);
      }
    }
    map.addLayer(overlay);
    return () => {
      map.removeLayer(overlay);
      markerRefs.current.clear();
      clusterRef.current = null;
    };
  }, [collection, layer, activeGridData, gridView, operations, opsLayers, opsStep]);

  useEffect(() => {
    if (layer !== 'grid' || !activeGridData) return;
    const cells = gridLayerRef.current;
    const map = mapRef.current;
    if (!cells || !map) return;
    const bounds = cells.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 14, animate: false });
    else map.setView(CENTER, 12, { animate: false });
  }, [activeGridData, layer]);

  useEffect(() => {
    if (layer !== 'grid' || !gridLayerRef.current) return;
    gridLayerRef.current.eachLayer(shape => shape.setStyle({
      weight: shape.feature.properties.cell_id === selectedCell ? 4 : 2,
      fillOpacity: shape.feature.properties.cell_id === selectedCell ? 0.7 : 0.48,
    }));
    const shape = cellLayers.current.get(selectedCell);
    if (shape) {
      mapRef.current.fitBounds(shape.getBounds(), { padding: [45, 45], maxZoom: 15, animate: false });
      shape.openPopup();
    }
  }, [selectedCell, activeGridData, layer]);

  const latest = useMemo(() => collection.features.slice(0, 8), [collection]);

  function locateDemoUnit(_unit, position) {
    const map = mapRef.current;
    if (!map) return;
    if (!opsLayers.patrols) setOpsLayers(previous => ({ ...previous, patrols: true }));
    map.setView([position.latitude, position.longitude], Math.max(14, map.getZoom()));
    // When the patrol layer is already mounted, open its matching popup.
    if (opsLayers.patrols) patrolMarkersRef.current.get(_unit.id)?.openPopup();
  }


  function showIncident(feature) {
    const map = mapRef.current;
    if (!map) return;
    const [lon, lat] = feature.geometry.coordinates;
    setLayer('markers');
    map.setView([lat, lon], Math.max(map.getZoom(), 15));
    // Switching from heatmap creates the marker layer in the next render.
    // Delay popup lookup until that render without depending on a timer.
    const tryOpen = () => {
      const marker = markerRefs.current.get(feature.id);
      const cluster = clusterRef.current;
      if (marker && cluster) cluster.zoomToShowLayer(marker, () => marker.openPopup());
    };
    if (layer === 'markers') tryOpen();
    else requestAnimationFrame(() => requestAnimationFrame(tryOpen));
  }

  function resetMap() {
    setCategory('');
    setStatus('');
    setGridView('single');
    setComparisonDraft({ ...DEFAULT_COMPARISON });
    setComparisonApplied({ ...DEFAULT_COMPARISON });
    setComparisonValidation('');
    setGridDraft({ ...DEFAULT_GRID });
    setGridApplied({ ...DEFAULT_GRID });
    setGridValidation('');
    setSelectedCell(null);
    setOpsLayers({ ...DEFAULT_OPERATION_LAYERS });
    if (operations) setOpsStep(Math.max(0, operations.timeline.steps - 1));
    setSelectedOperationIncident(null);
    onClearFocus?.();
    mapRef.current?.setView(CENTER, 13);
  }

  function applyGrid(event) {
    event.preventDefault();
    if (gridDraft.start_date && gridDraft.end_date && gridDraft.start_date > gridDraft.end_date) {
      setGridValidation('From date must not be later than To date.');
      return;
    }
    const min = Number(gridDraft.min_count);
    if (!Number.isInteger(min) || min < 2 || min > 1000) {
      setGridValidation('Minimum incidents per cell must be an integer from 2 to 1,000.');
      return;
    }
    setGridValidation('');
    setGridApplied({ ...gridDraft });
  }

  function applyComparison(event) {
    event.preventDefault();
    const d = comparisonDraft;
    if (![d.previous_start_date, d.previous_end_date, d.current_start_date, d.current_end_date].every(Boolean)) {
      setComparisonValidation('Choose all four dates.');
      return;
    }
    const previousDays = Math.round((Date.parse(d.previous_end_date + 'T00:00:00Z') -
      Date.parse(d.previous_start_date + 'T00:00:00Z')) / 86400000) + 1;
    const currentDays = Math.round((Date.parse(d.current_end_date + 'T00:00:00Z') -
      Date.parse(d.current_start_date + 'T00:00:00Z')) / 86400000) + 1;
    if (previousDays <= 0 || currentDays <= 0 ||
        d.previous_end_date >= d.current_start_date || previousDays !== currentDays || previousDays > 366) {
      setComparisonValidation('Choose earlier and later non-overlapping periods with equal durations (1–366 days each).');
      return;
    }
    const min = Number(d.min_count);
    if (!Number.isInteger(min) || min < 2 || min > 1000) {
      setComparisonValidation('Minimum incidents per cell must be an integer from 2 to 1,000.');
      return;
    }
    setComparisonValidation('');
    setComparisonApplied({ ...d });
  }

  function fitGrid() {
    const shapes = gridLayerRef.current;
    if (shapes?.getBounds().isValid()) {
      setSelectedCell(null);
      mapRef.current?.fitBounds(shapes.getBounds(), { padding: [45, 45], maxZoom: 14 });
    }
  }

  function downloadGrid() {
    if (!activeGridData) return;
    const applied = gridView === 'compare' ? comparisonApplied : gridApplied;
    const blob = new Blob([JSON.stringify({
      ...activeGridData, applied_filters: { ...applied, category, status },
    }, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = gridView === 'compare' ? 'crimemap-synthetic-period-comparison.geojson' : 'crimemap-synthetic-grid.geojson';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="crime-map-page">
      <div className="heading-row">
        <div>
          <div className="eyebrow">MODULE 02 · GEOSPATIAL INTELLIGENCE</div>
          <h1>Geospatial intelligence</h1>
          <p className="intro">Explore incidents, heatmaps, grid concentrations, and fictional operational assets on one map.</p>
        </div>
        <div className="map-layer-switch" role="group" aria-label="Map display mode">
          <button type="button" className={layer === 'markers' ? 'active' : ''} aria-pressed={layer === 'markers'} onClick={() => setLayer('markers')}><MapPinned size={16} /> Markers</button>
          <button type="button" className={layer === 'heatmap' ? 'active' : ''} aria-pressed={layer === 'heatmap'} onClick={() => { onClearFocus?.(); setLayer('heatmap'); }}><Layers size={17} /> Heatmap</button>
          {canAnalyze && <button type="button" className={layer === 'grid' ? 'active' : ''} aria-pressed={layer === 'grid'} onClick={() => { onClearFocus?.(); setLayer('grid'); }}><Grid2X2 size={17} /> Grid analysis</button>}
          <button type="button" className={layer === 'operations' ? 'active' : ''} aria-pressed={layer === 'operations'} onClick={() => { onClearFocus?.(); setLayer('operations'); }}><RadioTower size={17} /> Operations</button>
        </div>
      </div>
      <div className="demo-warning"><ShieldAlert size={19} /><div><strong>Demonstration map — synthetic incidents only</strong><span>All locations and reports shown here are fictional. Heatmaps and grids describe fictional concentrations. Operational overlays use simulated assets and history, not actual GPS or CCTV feeds.</span></div></div>
      {focusIncident && <div className="map-focus-banner" role="status">
        <MapPinned size={20} />
        <div><strong>Located incident: {focusIncident.category} · {focusIncident.id.startsWith('DEMO-') ? focusIncident.id : focusIncident.id.slice(0, 8)}</strong>
          <span>The map is centered on this fictional record. The gold ring highlights its location, even in a dense cluster.</span>
        </div>
        <button type="button" className="button subtle" onClick={() => onClearFocus?.()}>Clear selection</button>
      </div>}
      <section className="map-toolbar" aria-label="Crime map filters">
        <span className="map-filter-label"><SlidersHorizontal size={16} /> Filters</span>
        <select aria-label="Crime category" value={category} onChange={e => { onClearFocus?.(); setCategory(e.target.value); }}>
          <option value="">All categories</option>
          {CATEGORIES.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Incident status" value={status} onChange={e => { onClearFocus?.(); setStatus(e.target.value); }}>
          <option value="">All statuses</option>
          {STATUSES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button type="button" className="button subtle" onClick={resetMap}><RotateCcw size={15} /> Reset map</button>
      </section>

      {layer === 'grid' && <div className="grid-view-switch" role="group" aria-label="Grid analysis display">
        <button type="button" aria-pressed={gridView === 'single'}
          className={gridView === 'single' ? 'active' : ''}
          onClick={() => { setSelectedCell(null); setGridView('single'); }}>Single period</button>
        <button type="button" aria-pressed={gridView === 'compare'}
          className={gridView === 'compare' ? 'active' : ''}
          onClick={() => { setSelectedCell(null); setGridView('compare'); }}>Compare periods</button>
      </div>}
      {layer === 'grid' && gridView === 'compare' && <GridCompareForm
        draft={comparisonDraft} setDraft={setComparisonDraft} onSubmit={applyComparison}
        onReset={() => { setComparisonDraft({ ...DEFAULT_COMPARISON }); setComparisonApplied({ ...DEFAULT_COMPARISON }); setComparisonValidation(''); }}
        options={gridOptions} pending={comparisonPending} validation={comparisonValidation}
      />}
      {layer === 'grid' && gridView === 'single' && <form className="panel grid-filters" onSubmit={applyGrid} aria-label="Grid analysis filters" noValidate>
        <div className="grid-field"><label htmlFor="grid-start">From date (IST)</label><input id="grid-start" type="date" value={gridDraft.start_date} onChange={e => setGridDraft(d => ({ ...d, start_date: e.target.value }))} /></div>
        <div className="grid-field"><label htmlFor="grid-end">To date (IST)</label><input id="grid-end" type="date" value={gridDraft.end_date} onChange={e => setGridDraft(d => ({ ...d, end_date: e.target.value }))} /></div>
        <div className="grid-field"><label htmlFor="grid-zone">Demonstration zone</label><select id="grid-zone" value={gridDraft.zone} onChange={e => setGridDraft(d => ({ ...d, zone: e.target.value }))}>
          <option value="">All zones</option>
          {gridOptions?.zones.map(value => <option key={value} value={JSON.stringify(value)}>{value}</option>)}
          {gridOptions?.has_unspecified_zone && <option value="null">Unspecified zone</option>}
        </select></div>
        <div className="grid-field"><label htmlFor="grid-size">Cell width</label><select id="grid-size" value={gridDraft.cell_size_m} onChange={e => setGridDraft(d => ({ ...d, cell_size_m: e.target.value }))}>
          {[250, 500, 1000, 2000, 5000].map(value => <option key={value} value={value}>{value < 1000 ? value + ' m' : value / 1000 + ' km'}</option>)}
        </select></div>
        <div className="grid-field"><label htmlFor="grid-min">Minimum incidents / cell</label><input id="grid-min" type="number" min="2" max="1000" step="1" required value={gridDraft.min_count} onChange={e => setGridDraft(d => ({ ...d, min_count: e.target.value }))} /></div>
        <div className="grid-actions">
          <button type="submit" className="button primary"><SlidersHorizontal size={17} /> Apply grid filters</button>
          <button type="button" className="button subtle" onClick={() => { setGridDraft({ ...DEFAULT_GRID }); setGridApplied({ ...DEFAULT_GRID }); setGridValidation(''); }}>Clear grid filters</button>
        </div>
        <p className="grid-help">Category and status above apply to all visualization modes. Dates and zone filter single-period grid results only. Grid counts use a fixed study extent, regardless of map panning.</p>
        {gridPending && <p className="grid-pending" role="status">You have unapplied grid filter changes.</p>}
        {gridValidation && <p className="grid-error" role="alert">{gridValidation}</p>}
      </form>}
      {layer === 'operations' && <OperationsControls
        data={operations} loading={opsLoading} error={opsError}
        retry={() => setOpsRetry(value => value + 1)}
        layers={opsLayers} onLayers={setOpsLayers} step={opsStep} onStep={setOpsStep}
      />}
      <section className="map-layout" aria-label="Geospatial incident display">
        <div className="map-frame">
          <div className="map-canvas" ref={mapContainer} aria-label="Interactive map centered on Puducherry" />
          <div className="map-overlay-count" role="status">
            {layer === 'grid'
              ? gridView === 'compare'
                  ? comparisonLoading ? 'Comparing synthetic periods…' : comparisonError ? 'Comparison unavailable' : comparisonData ? count(comparisonData.meta.displayed_cells) + ' cells changed classification' : 'Choose comparison periods'
                  : gridLoading ? 'Computing grid counts…' : gridError ? 'Grid analysis unavailable' : gridData ? count(gridData.meta.qualifying_cells) + ' cells meet the threshold' : 'Choose grid filters'
              : layer === 'operations' ? opsLoading ? 'Loading simulated assets…' : opsError ? 'Demo operations unavailable' : 'SIMULATED ASSETS · NOT LIVE'
              : loading ? 'Loading visible reports…' : error ? 'Map data unavailable' : `${collection.meta.returned} of ${collection.meta.total} incidents in view`}
          </div>
          <div className="map-legend" aria-label="Map legend">
            <strong>{layer === 'grid' ? gridView === 'compare' ? 'Fixed-grid period comparison' : 'Synthetic incidents per cell' : layer === 'operations' ? 'Fictional operational layers' : layer === 'heatmap' ? 'Synthetic point density' : 'Incident categories'}</strong>
            {layer === 'operations' ? <div className="ops-map-legend">
              <span><i style={{ background: '#e39b80' }} /> Crime incidents</span>
              <span><i style={{ background: '#5bc7ce' }} /> CCTV assets</span>
              <span><i style={{ background: '#edb760' }} /> Road accidents</span>
              <span><i style={{ background: '#70b8ff' }} /> Demo patrols</span>
              <small>Illustrative locations only. Not a live monitoring map.</small>
            </div> : layer === 'grid' && gridView === 'compare' ? <ComparisonLegend /> : layer === 'grid' ? <div className="grid-legend"><span><i style={{ background: colorForCount(1) }} /> 1–4</span><span><i style={{ background: colorForCount(5) }} /> 5–9</span><span><i style={{ background: colorForCount(10) }} /> 10+</span><small>Only cells meeting the count threshold are displayed. No risk estimate.</small></div> : layer === 'heatmap' ? <span>Brighter areas contain more demonstration points. No risk estimate.</span> :
              <div className="legend-grid">{CATEGORIES.map(value => <span key={value}><i className={`legend-dot cat-${CATEGORY_KEYS[value]}`} />{value}</span>)}</div>}
          </div>
        </div>
        <aside className="map-results" aria-label={layer === 'grid' ? 'Ranked grid cells' : layer === 'operations' ? 'Simulated operational assets' : 'Incidents in current map view'}>
          {layer === 'grid' ? (gridView === 'compare' ? <CompareSidebar
            data={comparisonData} loading={comparisonLoading} error={comparisonError}
            selectedCell={selectedCell} onSelectCell={setSelectedCell}
            onFit={fitGrid} onDownload={downloadGrid}
            onRetry={() => setComparisonRetry(n => n + 1)}
          /> : <>
            <div className="map-results-heading"><h2>Grid concentration</h2><span>{gridData?.meta.qualifying_cells ?? '—'}</span></div>
            <p>Ranked grid cells describe synthetic incident counts, not crime risk.</p>
            <div className="grid-side-actions">
              <button type="button" className="button subtle" disabled={!gridData?.features.length} onClick={fitGrid}><Crosshair size={16} /> Fit cells</button>
              <button type="button" className="button subtle" disabled={!gridData || gridLoading} onClick={downloadGrid}><Download size={16} /> GeoJSON</button>
            </div>
            {gridLoading && <div className="map-results-empty" role="status">Analyzing all matching records…</div>}
            {gridError && <div className="map-data-error" role="alert">{gridError} <button type="button" onClick={() => setGridRetry(n => n + 1)}>Retry</button></div>}
            {gridData && <>
              <div className="grid-summary">
                <strong>{count(gridData.meta.total_matching_incidents)} matching incidents</strong>
                <span>{count(gridData.meta.analyzed_incidents)} inside the study extent</span>
                <span>{count(gridData.meta.incidents_in_qualifying_cells)} incidents in highlighted cells</span>
                <span>Largest cell: {count(gridData.meta.max_cell_count)} incidents</span>
                {gridData.meta.excluded_incidents > 0 && <span>{count(gridData.meta.excluded_incidents)} records outside the study extent</span>}
              </div>
              {gridData.features.length === 0 && <div className="map-results-empty">No grid cells meet this threshold. Lower the minimum count or adjust the filters. An empty result does not indicate a safe area.</div>}
              <div className="map-results-list" aria-label="Cells sorted by count">
                {gridData.features.map(feature => <button type="button" key={feature.properties.cell_id} className={'grid-cell-item' + (selectedCell === feature.properties.cell_id ? ' selected' : '')} aria-pressed={selectedCell === feature.properties.cell_id} onClick={() => setSelectedCell(feature.properties.cell_id)}>
                  <span className="grid-cell-top"><strong>#{feature.properties.rank} · {count(feature.properties.count)} incidents</strong><i style={{ background: colorForCount(feature.properties.count) }} /></span>
                  <span className="mono">{feature.properties.cell_id}</span>
                  <span>{count(feature.properties.density_per_km2)} per nominal km²</span>
                </button>)}
              </div>
            </>}
          </>) : layer === 'operations' ? <OperationsResults
            data={operations} loading={opsLoading} error={opsError}
            layers={opsLayers} step={opsStep} collection={collection}
            selectedIncident={selectedOperationIncident} onLocate={locateDemoUnit}
            onClear={() => setSelectedOperationIncident(null)}
          /> : <>
            <div className="map-results-heading"><h2>Visible incidents</h2><span>{collection.meta.total}</span></div>
            <p>Move or zoom the map to update this list. Latest records appear first.</p>
            {error && <div className="map-data-error" role="alert">{error}</div>}
            {collection.meta.truncated && <div className="map-data-warning" role="status">Displaying the newest {collection.meta.returned} of {collection.meta.total} matches. Zoom in to narrow the area.</div>}
            {!loading && !error && latest.length === 0 && <div className="map-results-empty">No demonstration incidents in this area. Try resetting the map or changing the filters.</div>}
            <div className="map-results-list">
              {latest.map(feature => <div key={feature.id} className="map-record">
                <div className="map-record-top"><span className={`legend-dot cat-${CATEGORY_KEYS[feature.properties.category] || 'other'}`} /><strong>{feature.properties.category}</strong><span className="map-status">{statusName(feature.properties.status)}</span></div>
                <div className="map-record-details"><span>{formatTime(feature.properties.occurred_at)}</span><span>{feature.properties.police_station || 'Unspecified zone'}</span></div>
                <button type="button" className="map-locate" onClick={() => showIncident(feature)}><Crosshair size={16} /> Locate incident</button>
              </div>)}
            </div>
            {!loading && collection.features.length > latest.length && <div className="map-more">Showing the latest {latest.length} in the list; all fetched points appear on the map.</div>}
          </>}
        </aside>
      </section>
      {layer === 'grid' && <details className="panel grid-method">
        <summary>How grid analysis works</summary>
        <p>Each matching incident within a fixed rectangular demonstration study extent is assigned to one square grid cell. Period comparison uses those exact same cells for both windows, with equal calendar durations. Cells meeting the minimum count are highlighted and ranked (equal counts share a rank). Counts are computed server-side across all matching records, not merely those currently visible on the map.</p>
        <p>Cell width, alignment, time period and filters affect the counts. Density uses nominal cell area without adjusting for population, exposure or reporting rates. These are not statistically validated hotspots or predictions. An increase or decrease is not evidence of risk changes or preventive effectiveness.</p>
        <p>The rectangular extent is not an official administrative boundary. No highlighted cell does not mean an area is safe.</p>
      </details>}
      <details className="panel geo-references">
        <summary>Official Puducherry Police resources</summary>
        <p>These are external government pages, not integrated data feeds. CrimeMap uses fictional demonstration records.</p>
        <div className="geo-reference-links">
          <a href="https://police.py.gov.in/finalvam.html" target="_blank" rel="noopener noreferrer">Official police website</a>
          <a href="https://police.py.gov.in/PS%20Profiles%202023/Police%20Stations%20Main%20Page.htm" target="_blank" rel="noopener noreferrer">Police station directory</a>
          <a href="https://police.py.gov.in/Crime%20Statistics/Crime%20Stat%202023/Puducherry%20Crime%20Statistic%20Main%20page.html" target="_blank" rel="noopener noreferrer">Published regional crime statistics</a>
          <a href="https://cctnscitizen.py.gov.in/citizen/login.aspx" target="_blank" rel="noopener noreferrer">CCTNS citizen services</a>
        </div>
      </details>
      <div className="map-footnote">Basemap © OpenStreetMap contributors.
Internet access is required for map tiles.
Synthetic incident data is for demonstration only.</div>
    </div>
  );
}
