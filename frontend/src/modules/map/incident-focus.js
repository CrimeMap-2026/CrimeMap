/** Registry -> existing map handoff. Data comes from an authenticated incident record.
 * Keep the geometry validated, while preserving the normal synthetic popup details.
 */
export function incidentMapFocus(incident) {
  if (!incident || typeof incident.id !== 'string' || !incident.id.trim() ||
      typeof incident.latitude !== 'number' || !Number.isFinite(incident.latitude) ||
      typeof incident.longitude !== 'number' || !Number.isFinite(incident.longitude) ||
      incident.latitude < -90 || incident.latitude > 90 ||
      incident.longitude < -180 || incident.longitude > 180) return null;

  return {
    id: incident.id,
    latitude: incident.latitude,
    longitude: incident.longitude,
    category: incident.category,
    occurred_at: incident.occurred_at,
    police_station: incident.police_station,
    description: incident.description,
    status: incident.status,
  };
}

/** Share the exact same popup as normal incident markers. */
export function focusedIncidentFeature(focus) {
  return {
    type: 'Feature',
    id: focus.id,
    geometry: {
      type: 'Point',
      coordinates: [focus.longitude, focus.latitude],
    },
    properties: {
      category: focus.category,
      occurred_at: focus.occurred_at,
      police_station: focus.police_station,
      description: focus.description,
      status: focus.status,
      source_type: 'synthetic',
    },
  };
}
