import L from 'leaflet';
import { Camera, CarFront, Clock3, Crosshair, RotateCcw, TrafficCone } from 'lucide-react';

export const DEFAULT_OPERATION_LAYERS = {
  incidents: true, patrols: true, cameras: true, accidents: true,
};

const COLORS = { incident: '#e39b80', camera: '#5bc7ce', accident: '#edb760' };
const PATROL_COLORS = ['#70b8ff', '#b6a2ff', '#77dec7'];

const number = value => Number(value || 0).toLocaleString('en-IN');
const dateTime = value => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value));

function safePopup(title, rows) {
  const root = document.createElement('div');
  root.className = 'crime-popup';
  const heading = document.createElement('strong');
  heading.textContent = title;
  root.append(heading);
  for (const [label, value] of rows) {
    const line = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = label + ': ';
    line.append(name, document.createTextNode(String(value ?? '—')));
    root.append(line);
  }
  const warning = document.createElement('small');
  warning.textContent = 'SYNTHETIC DEMONSTRATION DATA · Not a real reported asset';
  root.append(warning);
  return root;
}

export function nearestDemoPatrol(incident, data, step) {
  if (!incident || !data?.patrols?.length) return null;
  const toRad = x => x * Math.PI / 180;
  const results = data.patrols.map(patrol => {
    const point = patrol.track[Math.min(step, patrol.track.length - 1)];
    const dLat = toRad(point.latitude - incident.latitude);
    const dLon = toRad(point.longitude - incident.longitude);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(incident.latitude)) * Math.cos(toRad(point.latitude))
      * Math.sin(dLon / 2) ** 2;
    const kilometers = 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    return { patrol, point, kilometers };
  });
  return results.sort((a, b) => a.kilometers - b.kilometers)[0];
}

// Draw onto the existing CrimeMap Leaflet instance; never initialize a second map.
export function drawOperationalLayers(map, { data, collection, enabled, step, onSelectIncident }) {
  const group = L.layerGroup().addTo(map);
  const patrolMarkers = new Map();
  if (enabled.incidents) {
    for (const feature of collection.features) {
      const [lon, lat] = feature.geometry.coordinates;
      const item = feature.properties;
      const pin = L.circleMarker([lat, lon], {
        radius: 7, color: '#fff3ec', weight: 2, fillColor: COLORS.incident, fillOpacity: .95,
      }).bindPopup(safePopup('Synthetic incident: ' + item.category, [
        ['Occurred', dateTime(item.occurred_at)],
        ['Zone', item.police_station || 'Unspecified'],
        ['Status', item.status],
        ['Notes', item.description || 'No notes'],
      ])).addTo(group);
      pin.on('click', () => onSelectIncident({
        id: feature.id, latitude: lat, longitude: lon, category: item.category,
      }));
    }
  }
  if (!data) return { group, patrolMarkers };
  if (enabled.cameras) {
    for (const camera of data.cameras) {
      L.circleMarker([camera.latitude, camera.longitude], {
        radius: 8, color: '#f5ffff', weight: 2, fillColor: COLORS.camera, fillOpacity: .95,
      }).bindPopup(safePopup(camera.label, [
        ['Type', 'Fictional CCTV asset'], ['Demo zone', camera.zone],
        ['Video feed', 'Not connected'],
      ])).addTo(group);
    }
  }
  if (enabled.accidents) {
    for (const accident of data.accidents) {
      L.circleMarker([accident.latitude, accident.longitude], {
        radius: 8, color: '#fff3d9', weight: 2, fillColor: COLORS.accident, fillOpacity: .95,
      }).bindPopup(safePopup(accident.label, [
        ['Severity', accident.severity],
        ['Occurred', dateTime(accident.occurred_at)],
        ['Type', 'Fictional road accident'],
      ])).addTo(group);
    }
  }
  if (enabled.patrols) {
    data.patrols.forEach((patrol, i) => {
      const track = patrol.track.slice(0, step + 1);
      if (!track.length) return;
      const color = PATROL_COLORS[i % PATROL_COLORS.length];
      L.polyline(track.map(pos => [pos.latitude, pos.longitude]), {
        color, weight: 4, opacity: .85, dashArray: '8 6',
      }).addTo(group);
      const current = track[track.length - 1];
      const marker = L.circleMarker([current.latitude, current.longitude], {
        radius: 11, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1,
      }).bindPopup(safePopup(patrol.label, [
        ['Tracking', 'Historical simulation, not live'],
        ['Snapshot', dateTime(current.timestamp)],
        ['Location', current.latitude.toFixed(4) + ', ' + current.longitude.toFixed(4)],
      ])).addTo(group);
      patrolMarkers.set(patrol.id, marker);
    });
  }
  return { group, patrolMarkers };
}

export function OperationsControls({ data, loading, error, retry, layers, onLayers, step, onStep }) {
  const fields = [
    ['incidents', 'Crime incidents', COLORS.incident],
    ['cameras', 'CCTV assets', COLORS.camera],
    ['accidents', 'Road accidents', COLORS.accident],
    ['patrols', 'Demo patrols', PATROL_COLORS[0]],
  ];
  const currentTime = data?.patrols[0]?.track[step]?.timestamp;
  return <section className="panel ops-controls" aria-label="Operational layers and history">
    <div className="ops-controls-heading">
      <strong>Operational overlays</strong>
      <span>All fixtures are fictional — no live tracking</span>
    </div>
    <div className="ops-layer-toggles">
      {fields.map(([key, title, color]) => <label key={key} className="ops-layer-toggle">
        <input type="checkbox" checked={layers[key]} onChange={() => onLayers(state => ({ ...state, [key]: !state[key] }))} />
        <i style={{ background: color }} />
        {title}
      </label>)}
    </div>
    <div className="ops-timeline">
      <div className="ops-timeline-title">
        <Clock3 size={17} />
        <strong>Simulated patrol history</strong>
        <span>{currentTime ? dateTime(currentTime) : 'Awaiting demonstration data'}</span>
      </div>
      <input type="range" aria-label="Historical patrol snapshot" min="0"
        max={Math.max(0, (data?.timeline.steps || 1) - 1)} value={step}
        disabled={!data || !layers.patrols} onChange={event => onStep(Number(event.target.value))} />
      <div className="ops-timeline-footnote">Move the slider to show earlier fictional patrol positions. This is not a live GPS feed.</div>
    </div>
    {loading && <p className="ops-feedback" role="status">Loading fictional operational overlays…</p>}
    {error && <p className="ops-feedback ops-error" role="alert">{error} <button type="button" onClick={retry}>Retry</button></p>}
    {data && <div className="ops-counts" aria-label="Fictional assets summary">
      <span><CarFront size={16} /> {number(data.patrols.length)} patrol routes</span>
      <span><Camera size={16} /> {number(data.cameras.length)} CCTV points</span>
      <span><TrafficCone size={16} /> {number(data.accidents.length)} accident points</span>
    </div>}
  </section>;
}

export function OperationsResults({ data, loading, error, layers, step, selectedIncident, collection, onLocate, onClear }) {
  const nearest = nearestDemoPatrol(selectedIncident, data, step);
  return <>
    <div className="map-results-heading"><h2>Operational layers</h2><span>{data?.patrols.length ?? '—'}</span></div>
    <p>Fictional patrol locations, CCTV assets and accidents. No live devices connected.</p>
    {layers.incidents && <div className="ops-side-summary">{number(collection.meta.total)} synthetic incidents in the current map view</div>}
    {loading && <div className="map-results-empty">Loading example assets…</div>}
    {error && <div className="map-data-error">{error}</div>}
    {data && <>
      {layers.patrols && <div className="map-results-list ops-unit-list">
        {data.patrols.map((patrol, i) => {
          const pos = patrol.track[Math.min(step, patrol.track.length - 1)];
          return <button type="button" className="ops-unit" key={patrol.id}
            onClick={() => onLocate(patrol, pos)}>
            <span className="ops-unit-name"><i style={{ background: PATROL_COLORS[i % PATROL_COLORS.length] }} />
              <strong>{patrol.label}</strong><Crosshair size={16} /></span>
            <span>{pos.latitude.toFixed(4)}° N, {pos.longitude.toFixed(4)}° E</span>
            <span>{dateTime(pos.timestamp)} · Demo snapshot</span>
          </button>;
        })}
      </div>}
      {!layers.patrols && <div className="map-results-empty">Enable the demo patrol layer to see unit locations.</div>}
      <div className="ops-nearest">
        <h3>Illustrative proximity</h3>
        {selectedIncident && nearest ? <>
          <p>Selected synthetic {selectedIncident.category.toLowerCase()} incident.</p>
          <p><strong>{nearest.patrol.label}</strong> is approximately <strong>{nearest.kilometers.toFixed(2)} km</strong> away in a straight line at this snapshot.</p>
          <button type="button" className="button subtle" onClick={onClear}>Clear selection</button>
        </> : <p>Click an orange incident point to compare fictional patrol distances.</p>}
        <small>Not road distance, response time, dispatch advice, or real asset availability.</small>
      </div>
    </>}
  </>;
}
