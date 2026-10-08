export const CATEGORIES = [
  'Theft', 'Vehicle Theft', 'Burglary', 'Robbery',
  'Assault', 'Cybercrime', 'Vandalism', 'Other',
];

export const STATUSES = [
  ['reported', 'Reported'],
  ['under_investigation', 'Under investigation'],
  ['closed', 'Closed'],
];

function messageFromError(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((entry) => entry.msg).join('; ');
  if (detail?.row) {
    const errors = detail.errors?.map((item) => `${item.loc?.join('.')}: ${item.msg}`).join('; ');
    return `Row ${detail.row}: ${errors || detail.error || 'Invalid record'}`;
  }
  return 'The request could not be completed.';
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('Cannot reach the API. Start the FastAPI server on port 8000.');
  }
  if (!response.ok) {
    let body;
    try { body = await response.json(); } catch { body = {}; }
    throw new Error(messageFromError(body.detail) || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export function listIncidents(filters, signal) {
  const query = new URLSearchParams({ limit: String(filters.limit), offset: String(filters.offset) });
  if (filters.category) query.set('category', filters.category);
  if (filters.status) query.set('status', filters.status);
  if (filters.q.trim()) query.set('q', filters.q.trim());
  return request(`/api/incidents?${query}`, { signal });
}

export function createIncident(incident) {
  return request('/api/incidents', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(incident),
  });
}

export function changeStatus(id, status) {
  return request(`/api/incidents/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
}

export function removeIncident(id) {
  return request(`/api/incidents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function importIncidents(file) {
  const form = new FormData();
  form.append('file', file);
  return request('/api/incidents/import', { method: 'POST', body: form });
}
