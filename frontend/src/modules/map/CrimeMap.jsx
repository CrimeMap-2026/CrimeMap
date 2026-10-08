import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Crosshair, Layers, MapPinned, RotateCcw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES, STATUSES, fetchMapIncidents } from '../../api';
import './map.css';

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

export default function CrimeMap({ refresh = 0 }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const clusterRef = useRef(null);
  const [bounds, setBounds] = useState(null);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [layer, setLayer] = useState('markers');
  const [collection, setCollection] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!bounds) return;
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
  }, [bounds, category, status, refresh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRefs.current.clear();
    clusterRef.current = null;
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
  }, [collection, layer]);

  const latest = useMemo(() => collection.features.slice(0, 8), [collection]);

  function showIncident(feature) {
    const map = mapRef.current;
    if (!map) return;
    const [lon, lat] = feature.geometry.coordinates;
    setLayer('markers');
    map.setView([lat, lon], Math.max(map.getZoom(), 15));
    const marker = markerRefs.current.get(feature.id);
    const cluster = clusterRef.current;
    if (marker && cluster) cluster.zoomToShowLayer(marker, () => marker.openPopup());
  }

  function resetMap() {
    setCategory('');
    setStatus('');
    mapRef.current?.setView(CENTER, 13);
  }

  return (
    <div className="crime-map-page">
      <div className="heading-row">
        <div>
          <div className="eyebrow">MODULE 02 · GEOSPATIAL VISUALIZATION</div>
          <h1>Interactive crime map</h1>
          <p className="intro">Explore demonstration incidents by geographic area, type, and status.</p>
        </div>
        <div className="map-layer-switch" role="group" aria-label="Map display mode">
          <button type="button" className={layer === 'markers' ? 'active' : ''} aria-pressed={layer === 'markers'} onClick={() => setLayer('markers')}><MapPinned size={16} /> Markers</button>
          <button type="button" className={layer === 'heatmap' ? 'active' : ''} aria-pressed={layer === 'heatmap'} onClick={() => setLayer('heatmap')}><Layers size={16} /> Heatmap</button>
        </div>
      </div>
      <div className="demo-warning"><ShieldAlert size={19} /><div><strong>Demonstration map — synthetic incidents only</strong><span>All locations and reports shown here are fictional. The heatmap is a visualization of synthetic point density, not a real hotspot map or crime prediction.</span></div></div>
      <section className="map-toolbar" aria-label="Crime map filters">
        <span className="map-filter-label"><SlidersHorizontal size={16} /> Filters</span>
        <select aria-label="Crime category" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(value => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Incident status" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button type="button" className="button subtle" onClick={resetMap}><RotateCcw size={15} /> Reset map</button>
      </section>
      <section className="map-layout" aria-label="Geospatial incident display">
        <div className="map-frame">
          <div className="map-canvas" ref={mapContainer} aria-label="Interactive map centered on Puducherry" />
          <div className="map-overlay-count" role="status">
            {loading ? 'Loading visible reports…' : error ? 'Map data unavailable' : `${collection.meta.returned} of ${collection.meta.total} incidents in view`}
          </div>
          <div className="map-legend" aria-label="Map legend">
            <strong>{layer === 'heatmap' ? 'Synthetic point density' : 'Incident categories'}</strong>
            {layer === 'heatmap' ? <span>Brighter areas contain more demonstration points. No risk estimate.</span> :
              <div className="legend-grid">{CATEGORIES.map(value => <span key={value}><i className={`legend-dot cat-${CATEGORY_KEYS[value]}`} />{value}</span>)}</div>}
          </div>
        </div>
        <aside className="map-results" aria-label="Incidents in current map view">
          <div className="map-results-heading"><h2>Visible incidents</h2><span>{collection.meta.total}</span></div>
          <p>Move or zoom the map to update the list. Latest records are shown first.</p>
          {error && <div className="map-data-error" role="alert">{error}</div>}
          {collection.meta.truncated && <div className="map-data-warning" role="status">Displaying the newest {collection.meta.returned} of {collection.meta.total} matches. Zoom in to narrow the area.</div>}
          {!loading && !error && latest.length === 0 && <div className="map-results-empty">No demonstration incidents in this area. Try resetting the map or changing the filters.</div>}
          <div className="map-results-list">
            {latest.map(feature => <div key={feature.id} className="map-record">
              <div className="map-record-top"><span className={`legend-dot cat-${CATEGORY_KEYS[feature.properties.category] || 'other'}`} /><strong>{feature.properties.category}</strong><span className="map-status">{statusName(feature.properties.status)}</span></div>
              <div className="map-record-details"><span>{formatTime(feature.properties.occurred_at)}</span><span>{feature.properties.police_station || 'Unspecified zone'}</span></div>
              <button type="button" className="map-locate" onClick={() => showIncident(feature)}><Crosshair size={14} /> Locate incident</button>
            </div>)}
          </div>
          {!loading && collection.features.length > latest.length && <div className="map-more">Showing the latest {latest.length} in the list; all fetched points appear on the map.</div>}
        </aside>
      </section>
      <div className="map-footnote">Basemap © OpenStreetMap contributors.
Internet access is required for map tiles.
Synthetic incident data is for demonstration only.</div>
    </div>
  );
}
