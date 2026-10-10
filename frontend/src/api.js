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
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('crimemap-session-expired'));
    }
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

export function previewIncidents(file, signal) {
  const form = new FormData();
  form.append('file', file);
  return request('/api/incidents/import/preview', { method: 'POST', body: form, signal });
}

export function importIncidents(file, { skipDuplicates = false } = {}) {
  const form = new FormData();
  form.append('file', file);
  const suffix = skipDuplicates ? '?skip_duplicates=true' : '';
  return request('/api/incidents/import' + suffix, { method: 'POST', body: form });
}

export function fetchMapIncidents(bounds, filters, signal) {
  const query = new URLSearchParams({
    south: String(bounds.south),
    west: String(bounds.west),
    north: String(bounds.north),
    east: String(bounds.east),
    limit: '2000',
  });
  if (filters.category) query.set('category', filters.category);
  if (filters.status) query.set('status', filters.status);
  return request(`/api/map/incidents?${query}`, { signal });
}

export function fetchAnalytics(filters, signal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  return request(`/api/analytics/overview?${query}`, { signal });
}

export function fetchAnalyticsFilters(signal) {
  return request('/api/analytics/filters', { signal });
}

export function fetchGridComparison(filters, signal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) query.set(key, value);
  }
  return request(`/api/hotspots/compare?${query}`, { signal });
}

export function fetchHotspots(filters, signal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  return request(`/api/hotspots/grid?${query}`, { signal });
}

// Static, read-only fictional operations overlays; this is not a real-time feed.
export function fetchOperations(signal) {
  return request('/api/operations/overview', { signal });
}

export function signIn(username, password) {
  return request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export function whoAmI() {
  return request('/api/auth/me');
}

export function signOut() {
  return request('/api/auth/logout', { method: 'POST' });
}

export function changeOwnPassword(currentPassword, newPassword) {
  return request('/api/auth/change-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export function listUsers(signal) {
  return request('/api/admin/users', { signal });
}

export function addUser(username, password, role) {
  return request('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  });
}

export function modifyUser(id, patch) {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function resetUserPassword(id, password) {
  return request(`/api/admin/users/${encodeURIComponent(id)}/password`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function fetchPreventionInsights(filters, signal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return request('/api/prevention/insights' + (qs ? '?' + qs : ''), { signal });
}

export function fetchPreventionPlans(signal) {
  return request('/api/prevention/plans', { signal });
}

export function createPreventionPlan(payload) {
  return request('/api/prevention/plans', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function reviewPreventionPlan(id, periods, signal) {
  const params = new URLSearchParams(periods);
  return request(`/api/prevention/plans/${encodeURIComponent(id)}/review?${params}`, { signal });
}

export function updatePreventionPlan(id, payload) {
  return request(`/api/prevention/plans/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function listAuditEvents(filters = {}, signal) {
  const params = new URLSearchParams({
    limit: String(filters.limit || 15),
    offset: String(filters.offset || 0),
  });
  if (filters.entity_type) params.set('entity_type', filters.entity_type);
  if (filters.actor_id) params.set('actor_id', filters.actor_id);
  return request(`/api/admin/audit?${params}`, { signal });
}

/** Download a real PDF generated from current server aggregates and saved plans. */
export async function downloadPresentationReport(query) {
  const params = new URLSearchParams(query);
  let response;
  try {
    response = await fetch(`/api/reports/presentation?${params}`, {
      headers: { Accept: 'application/pdf' },
    });
  } catch {
    throw new Error('Cannot reach the API. Start the FastAPI server on port 8000.');
  }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('crimemap-session-expired'));
    let detail;
    try { detail = (await response.json()).detail; } catch { detail = null; }
    throw new Error(messageFromError(detail));
  }
  const blob = await response.blob();
  if (!blob.size || !response.headers.get('content-type')?.includes('application/pdf')) {
    throw new Error('The server did not return a valid PDF.');
  }
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = 'crimemap-synthetic-presentation.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 15000);
  return blob.size;
}
