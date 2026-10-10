import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, RotateCcw } from 'lucide-react';
import './incident-location.css';

// The same Leaflet/OpenStreetMap stack used by Geospatial Intelligence.
// Nothing is saved or geocoded until the parent form is explicitly submitted.
const CENTER = [11.935, 79.83];
const PIN_ICON = L.divIcon({
  className: 'incident-picker-pin-icon',
  html: '<span class="incident-picker-pin-dot" aria-hidden="true"></span>',
  iconSize: [30, 38],
  iconAnchor: [15, 34],
});

export function validIncidentPosition(latitude, longitude) {
  return typeof latitude === 'number' && Number.isFinite(latitude) &&
    typeof longitude === 'number' && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}

export default function IncidentLocationPicker({ latitude, longitude, onChange, disabled = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const latestCallback = useRef(onChange);
  const latestDisabled = useRef(disabled);
  const selected = validIncidentPosition(latitude, longitude);

  useEffect(() => { latestCallback.current = onChange; }, [onChange]);
  useEffect(() => { latestDisabled.current = disabled; }, [disabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: CENTER, zoom: 13, keyboard: true, scrollWheelZoom: false,
      zoomControl: true,
    });
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    function setPin(latlng, notify) {
      const { lat, lng } = latlng;
      if (!validIncidentPosition(lat, lng)) return;
      if (!markerRef.current) {
        const marker = L.marker([lat, lng], {
          draggable: true, autoPan: true, icon: PIN_ICON,
          keyboard: true, bubblingMouseEvents: false,
          title: 'Drag to adjust the incident location',
        }).addTo(map);
        marker.on('dragend', () => {
          if (latestDisabled.current) return;
          const current = marker.getLatLng();
          setPin(current, true);
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(latlng);
      }
      if (notify) latestCallback.current({ latitude: lat, longitude: lng });
    }

    // Restore the position when reopening an unfinished draft.
    if (validIncidentPosition(latitude, longitude)) {
      setPin({ lat: latitude, lng: longitude }, false);
      map.setView([latitude, longitude], 15);
    }

    map.on('click', event => {
      if (!latestDisabled.current) setPin(event.latlng, true);
    });

    // Leaflet needs a size check after the modal is attached to the DOM.
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(timer);
      map.off();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once per form mount. Later position changes sync below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    if (validIncidentPosition(latitude, longitude)) {
      if (marker) marker.setLatLng([latitude, longitude]);
    } else if (marker) {
      marker.remove();
      markerRef.current = null;
    }
  }, [latitude, longitude]);

  useEffect(() => {
    const marker = markerRef.current;
    if (marker?.dragging) {
      if (disabled) marker.dragging.disable();
      else marker.dragging.enable();
    }
  }, [disabled, latitude, longitude]);

  function chooseCenter() {
    if (disabled || !mapRef.current) return;
    const { lat, lng } = mapRef.current.getCenter();
    if (validIncidentPosition(lat, lng)) onChange({ latitude: lat, longitude: lng });
  }

  function resetMap() {
    if (disabled || !mapRef.current) return;
    mapRef.current.setView(CENTER, 13);
  }

  return <div className="incident-picker" aria-label="Choose incident location">
    <div className="incident-picker-heading">
      <div className="incident-picker-label"><MapPin size={18} /><strong>Incident location <span aria-hidden="true">*</span></strong></div>
      <p>Click or tap the map to place a pin, then <strong>drag the pin</strong> to fine-tune its location.</p>
    </div>
    <div className="incident-picker-map" ref={containerRef}
      aria-label="Interactive OpenStreetMap. Click to place the incident marker; drag it to adjust." />
    <div className="incident-picker-controls">
      <button type="button" className="button subtle" disabled={disabled} onClick={chooseCenter}>
        <Crosshair size={16} /> Use map center
      </button>
      <button type="button" className="button subtle" disabled={disabled} onClick={resetMap}>
        <RotateCcw size={16} /> Back to Puducherry
      </button>
    </div>
    <div className={'incident-picker-location' + (selected ? ' is-selected' : '')}
      role="status" aria-live="polite">
      {selected ? <>
        <MapPin size={17} />
        <span>Selected: <strong>{latitude.toFixed(6)}° N, {longitude.toFixed(6)}° E</strong></span>
        <button type="button" disabled={disabled} onClick={() => onChange({ latitude: null, longitude: null })}>
          Clear pin
        </button>
      </> : <>
        <MapPin size={17} />
        <span>No location selected. Place a pin on the map to enable saving.</span>
      </>}
    </div>
    <p className="incident-picker-hint">
      Keyboard: focus the map and use arrow keys to pan, then choose <strong>Use map center</strong>.
      Use +/− to zoom. Coordinates are recorded automatically and remain synthetic demonstration data.
    </p>
  </div>;
}
