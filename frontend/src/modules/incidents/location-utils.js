/** Shared form safeguard: only finite, explicitly selected geographic coordinates. */
export function validIncidentPosition(latitude, longitude) {
  return typeof latitude === 'number' && Number.isFinite(latitude) &&
    typeof longitude === 'number' && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}


// Fictional zone reference points near synthetic dataset clusters.
// These are NOT administrative boundaries, station limits or verified jurisdictions.
// Approximate nearest-reference labeling exists only for creating demo records.
export const DEMO_ZONE_REFERENCES = Object.freeze([
  Object.freeze({ name: 'Demo Zone A', latitude: 11.9332, longitude: 79.8299 }),
  Object.freeze({ name: 'Demo Zone B', latitude: 11.9509, longitude: 79.8196 }),
  Object.freeze({ name: 'Demo Zone C', latitude: 11.9195, longitude: 79.8039 }),
  Object.freeze({ name: 'Demo Zone D', latitude: 11.9442, longitude: 79.8418 }),
]);
export const DEMO_ZONE_MAX_DISTANCE_METERS = 3500;
const EARTH_RADIUS_METERS = 6371008.8;

function distanceMeters(lat1, lon1, lat2, lon2) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Return a fictional zone name or '' when there is no nearby reference point. */
export function suggestDemoZone(latitude, longitude) {
  if (!validIncidentPosition(latitude, longitude)) return '';
  let closest = null;
  let distance = Infinity;
  for (const reference of DEMO_ZONE_REFERENCES) {
    const candidate = distanceMeters(
      latitude, longitude, reference.latitude, reference.longitude,
    );
    if (candidate < distance) {
      closest = reference;
      distance = candidate;
    }
  }
  return distance <= DEMO_ZONE_MAX_DISTANCE_METERS ? closest.name : '';
}

/** Update every location-related field together so a previous zone never goes stale. */
export function locationFieldsForPin(previous, latitude, longitude) {
  if (!validIncidentPosition(latitude, longitude)) {
    return { ...previous, latitude: null, longitude: null, police_station: '' };
  }
  return {
    ...previous, latitude, longitude,
    police_station: suggestDemoZone(latitude, longitude),
  };
}
