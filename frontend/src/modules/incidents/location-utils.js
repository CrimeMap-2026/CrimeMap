/** Shared form safeguard: only finite, explicitly selected geographic coordinates. */
export function validIncidentPosition(latitude, longitude) {
  return typeof latitude === 'number' && Number.isFinite(latitude) &&
    typeof longitude === 'number' && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}
