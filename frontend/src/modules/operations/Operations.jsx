import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, CarFront, Clock3, Crosshair, Layers, MapPinned, RotateCcw, ShieldAlert, TrafficCone } from 'lucide-react';
import { CATEGORIES, STATUSES, fetchMapIncidents, fetchOperations } from '../../api';
import './operations.css';

const CENTER = [11.935, 79.83];
const EMPTY = { type: 'FeatureCollection', features: [], meta: { total: 0, returned: 0, truncated: false } };
const DEFAULT_LAYERS = { incidents: true, accidents: true, cameras: true, patrols: true };
const formatNumber = value => Number(value || 0).toLocaleString('en-IN');
const formatTime = timestamp => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(timestamp));

function getBounds(map) {
  const b = map.getBounds();
  return {
    south: Math.max(-90, b.getSouth()), west: Math.max(-180, b.getWest()),
    north: Math.min(90, b.getNorth()), east: Math.min(180, b.getEast()),
  };
}

// Plain text DOM nodes prevent injection from incident notes or external source labels.
function popup(title, rows) {
  const root = document.createElement('div');
  root.className = 'operations-popup';
  const heading = document.createElement('strong');
  heading.textContent = title;
  root.append(heading);
  for (const [name, value] of rows) {
    const line = document.createElement('div');
    const key = document.createElement('b');
    key.textContent = name + ': ';
    line.append(key, document.createTextNode(String(value ?? '—')));
    root.append(line);
  }
  const warning = document.createElement('small');
  warning.textContent = 'SYNTHETIC DEMONSTRATION DATA — not a real field asset';
  root.append(warning);
  return root;
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a.latitude * rad, lat2 = b.latitude * rad;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const patrolColors = ['#70b8ff', '#b6a2ff', '#77dec7'];

export default function Operations({ refresh = 0 }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const unitMarkers = useRef(new Map());
  const [bounds, setBounds] = useState(null);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [operations, setOperations] = useState(null);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState('');
  const [assetRetry, setAssetRetry] = useState(0);
  const [incidents, setIncidents] = useState(EMPTY);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [incidentsError, setIncidentsError] = useState('');
  const [step, setStep] = useState(0);
  const [focusIncident, setFocusIncident] = useState(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { center: CENTER, zoom: 13, zoomControl: false });
    mapRef.current = map;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    const onTileError = () => setTileError(true);
    tiles.on('tileerror', onTileError);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
    const onMove = () => setBounds(getBounds(map));
    map.on('moveend', onMove);
    onMove();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      map.off('moveend', onMove);
      tiles.off('tileerror', onTileError);
      unitMarkers.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAssetsLoading(true);
    setAssetsError('');
    fetchOperations(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setOperations(data);
      setStep(Math.max(0, data.timeline.steps - 1));
      setAssetsLoading(false);
    }).catch(err => {
      if (controller.signal.aborted) return;
      setAssetsError(err.message || 'Could not load demonstration assets.');
      setAssetsLoading(false);
    });
    return () => controller.abort();
  }, [assetRetry]);

  useEffect(() => {
    if (!bounds || !layers.incidents) return;
    const controller = new AbortController();
    setIncidentsLoading(true);
    setIncidentsError('');
    fetchMapIncidents(bounds, { category, status }, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setIncidents(data);
      setIncidentsLoading(false);
    }).catch(err => {
      if (controller.signal.aborted) return;
      setIncidentsError(err.message || 'Could not load incident points.');
      setIncidents(EMPTY);
      setIncidentsLoading(false);
    });
    return () => controller.abort();
  }, [bounds, category, status, layers.incidents, refresh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    unitMarkers.current.clear();

    if (layers.incidents) {
      for (const feature of incidents.features) {
        const [lon, lat] = feature.geometry.coordinates;
        const item = feature.properties;
        const circle = L.circleMarker([lat, lon], {
          radius: 6.5, color: '#f0f6ff', weight: 2, fillColor: '#de8f78', fillOpacity: 0.92,
        }).addTo(group);
        circle.bindPopup(popup('Synthetic incident · ' + item.category, [
          ['Occurred', formatTime(item.occurred_at)],
          ['Status', STATUSES.find(([key]) => key === item.status)?.[1] || item.status],
          ['Zone', item.police_station || 'Unspecified'],
          ['Notes', item.description || 'No notes'],
        ]));
        circle.on('click', () => setFocusIncident({
          id: feature.id, latitude: lat, longitude: lon, category: item.category,
        }));
      }
    }

    if (operations && layers.cameras) {
      for (const camera of operations.cameras) {
        L.circleMarker([camera.latitude, camera.longitude], {
          radius: 8, color: '#f0f6ff', weight: 2, fillColor: '#60bfcc', fillOpacity: 0.95,
        }).bindPopup(popup(camera.label, [
          ['Type', 'Hypothetical CCTV location'], ['Demo zone', camera.zone],
          ['Feed', 'No camera connected'],
        ])).addTo(group);
      }
    }

    if (operations && layers.accidents) {
      for (const accident of operations.accidents) {
        L.circleMarker([accident.latitude, accident.longitude], {
          radius: 8, color: '#fff0d5', weight: 2, fillColor: '#eeb35f', fillOpacity: 0.95,
        }).bindPopup(popup(accident.label, [
          ['Type', 'Fictional road accident'], ['Severity', accident.severity],
          ['Occurred', formatTime(accident.occurred_at)],
        ])).addTo(group);
      }
    }

    if (operations && layers.patrols) {
      operations.patrols.forEach((patrol, i) => {
        const track = patrol.track.slice(0, step + 1);
        if (!track.length) return;
        const color = patrolColors[i % patrolColors.length];
        L.polyline(track.map(p => [p.latitude, p.longitude]), {
          color, weight: 4, opacity: 0.8, dashArray: '8 6',
        }).addTo(group);
        const pos = track[track.length - 1];
        const point = L.circleMarker([pos.latitude, pos.longitude], {
          radius: 10, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1,
        }).bindPopup(popup(patrol.label, [
          ['Mode', 'Recorded demo route (not live)'],
          ['Snapshot', formatTime(pos.timestamp)],
          ['Location', pos.latitude.toFixed(4) + ', ' + pos.longitude.toFixed(4)],
        ])).addTo(group);
        unitMarkers.current.set(patrol.id, point);
      });
    }
    return () => {
      map.removeLayer(group);
      unitMarkers.current.clear();
    };
  }, [operations, incidents, layers, step]);

  const unitSnapshot = useMemo(() => operations?.patrols.map(p => ({
    ...p, position: p.track[Math.min(step, p.track.length - 1)],
  })) || [], [operations, step]);

  const nearest = useMemo(() => {
    if (!focusIncident || !unitSnapshot.length) return null;
    const list = unitSnapshot.map(p => ({
      ...p, kilometers: distanceKm(focusIncident, p.position),
    }));
    list.sort((a, b) => a.kilometers - b.kilometers);
    return list[0];
  }, [focusIncident, unitSnapshot]);

  function locateUnit(unit) {
    if (!mapRef.current) return;
    mapRef.current.setView([unit.position.latitude, unit.position.longitude], Math.max(14, mapRef.current.getZoom()));
    if (!layers.patrols) setLayers(prev => ({ ...prev, patrols: true }));
    else unitMarkers.current.get(unit.id)?.openPopup();
  }

  function resetView() {
    setLayers(DEFAULT_LAYERS);
    setCategory('');
    setStatus('');
    setFocusIncident(null);
    if (operations) setStep(operations.timeline.steps - 1);
    mapRef.current?.setView(CENTER, 13);
  }

  const toggle = key => setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  const currentTimestamp = operations?.patrols[0]?.track[step]?.timestamp;

  return <div className="operations-page">
    <div className="heading-row">
      <div>
        <div className="eyebrow">MODULE 04 · OPERATIONAL OVERVIEW</div>
        <h1>Field operations overview</h1>
        <p className="intro">Explore crime, fictional road accidents, hypothetical CCTV locations and simulated patrol history together.</p>
      </div>
      <button type="button" className="button subtle" onClick={resetView}><RotateCcw size={17} /> Reset view</button>
    </div>

    <div className="demo-warning">
      <ShieldAlert size={20} />
      <div><strong>SYNTHETIC DEMONSTRATION DATA · NO LIVE TRACKING</strong>
        <span>All patrols, routes, accident locations and CCTV markers here are fictional examples. No GPS units, CCTV streams or police dispatch systems are connected. This is not an operational monitoring system.</span>
      </div>
    </div>

    <section className="stats-grid operations-stats" aria-label="Demonstration operational metrics">
      <div className="stat"><div className="stat-top"><span>Crime incidents in view</span><MapPinned size={18} /></div><strong>{incidentsLoading ? '—' : formatNumber(incidents.meta.total)}</strong><small>Viewport-based synthetic records</small></div>
      <div className="stat"><div className="stat-top"><span>Demo patrol routes</span><CarFront size={18} /></div><strong>{assetsLoading ? '—' : formatNumber(operations?.patrols.length)}</strong><small>Recorded sample tracks, not live GPS</small></div>
      <div className="stat"><div className="stat-top"><span>Hypothetical CCTV</span><Camera size={18} /></div><strong>{assetsLoading ? '—' : formatNumber(operations?.cameras.length)}</strong><small>No real feeds connected</small></div>
      <div className="stat"><div className="stat-top"><span>Fictional accidents</span><TrafficCone size={18} /></div><strong>{assetsLoading ? '—' : formatNumber(operations?.accidents.length)}</strong><small>Illustrative map points</small></div>
    </section>

    <section className="panel operations-controls" aria-label="Operational map filters">
      <div className="operations-control-title"><Layers size={18} /><strong>Map layers</strong></div>
      <div className="operations-layers">
        {[
          ['incidents', 'Crime incidents', '#de8f78'],
          ['accidents', 'Road accidents', '#eeb35f'],
          ['cameras', 'CCTV locations', '#60bfcc'],
          ['patrols', 'Demo patrol routes', '#70b8ff'],
        ].map(([key, label, color]) => <label key={key} className="operations-toggle">
          <input type="checkbox" checked={layers[key]} onChange={() => toggle(key)} />
          <i style={{ background: color }} /> {label}
        </label>)}
      </div>
      <div className="operations-controls-bottom">
        <label>Crime category <select value={category} disabled={!layers.incidents} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>{CATEGORIES.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Case status <select value={status} disabled={!layers.incidents} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>{STATUSES.map(([value, name]) => <option value={value} key={value}>{name}</option>)}
        </select></label>
      </div>
    </section>

    <section className="panel operations-history" aria-label="Simulated patrol history playback">
      <div className="operations-history-heading"><Clock3 size={18} /><strong>Patrol history — demonstration snapshots</strong><span>{currentTimestamp ? formatTime(currentTimestamp) : 'Loading timeline…'}</span></div>
      <input aria-label="Patrol history position" type="range" min="0" max={Math.max(0, (operations?.timeline.steps || 1) - 1)} value={step} disabled={!operations} onChange={e => setStep(Number(e.target.value))} />
      <div className="operations-history-footer"><span>Start</span><span>Drag to inspect historical snapshots · not a live feed</span><span>End</span></div>
    </section>

    {assetsError && <div className="notice error" role="alert">{assetsError}<button type="button" onClick={() => setAssetRetry(n => n + 1)}>Retry</button></div>}
    {incidentsError && layers.incidents && <div className="notice error" role="alert">Incident layer: {incidentsError}</div>}
    {incidents.meta.truncated && layers.incidents && <p className="operations-note" role="status">Only the newest {incidents.meta.returned} of {incidents.meta.total} viewport incidents are drawn. Zoom in to see more.</p>}

    <section className="operations-layout" aria-label="Layered geographic situation overview">
      <div className="operations-map-wrap">
        <div className="operations-map" ref={container} aria-label="Interactive synthetic operations map near Puducherry" />
        <div className="operations-map-label" role="status">{assetsLoading ? 'Loading fictional operational assets…' : 'SIMULATED FIELD OVERVIEW · NOT LIVE'}</div>
        {tileError && <div className="operations-tile-warning">Some OpenStreetMap basemap tiles could not load.</div>}
      </div>
      <aside className="operations-sidebar" aria-label="Demonstration patrol routes">
        <div className="operations-side-heading"><h2>Demo patrol units</h2><span>{unitSnapshot.length}</span></div>
        <p>Choose a fictional unit to locate its current demonstration snapshot.</p>
        {assetsLoading && <div className="operations-empty">Loading recorded tracks…</div>}
        {!assetsLoading && !assetsError && !unitSnapshot.length && <div className="operations-empty">No example patrol routes available.</div>}
        {unitSnapshot.map((unit, i) => <button className="operations-unit" type="button" key={unit.id} onClick={() => locateUnit(unit)}>
          <span className="operations-unit-top"><i style={{ background: patrolColors[i % patrolColors.length] }} /><strong>{unit.label}</strong><Crosshair size={16} /></span>
          <span>{unit.position.latitude.toFixed(4)}° N, {unit.position.longitude.toFixed(4)}° E</span>
          <span>History snapshot · {formatTime(unit.position.timestamp)}</span>
        </button>)}
        <div className="operations-nearest">
          <h3>Illustrative proximity check</h3>
          {focusIncident ? <><p>Selected synthetic {focusIncident.category.toLowerCase()} incident.</p>
            {nearest ? <p><strong>{nearest.label}</strong> is approximately <strong>{nearest.kilometers.toFixed(2)} km</strong> away in a straight line at this demo timestamp.</p> : <p>No patrol snapshot available.</p>}
            <button type="button" className="button subtle" onClick={() => setFocusIncident(null)}>Clear selection</button></>
            : <p>Click an incident marker on the map to compare its straight-line distance with the simulated patrol positions.</p>}
          <small>Not a road route, travel-time estimate, patrol assignment or dispatch recommendation.</small>
        </div>
      </aside>
    </section>

    <div className="operations-footer">SYNTHETIC DEMONSTRATION DATA · Basemap © OpenStreetMap contributors · No surveillance, fleet or emergency integrations.</div>
  </div>;
}
