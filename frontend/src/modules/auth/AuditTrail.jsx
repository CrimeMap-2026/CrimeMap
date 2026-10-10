import { useEffect, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { listAuditEvents } from '../../api';

const PAGE_SIZE = 15;
const ACTION_LABELS = {
  'incident.created': 'Incident created',
  'incident.updated': 'Incident updated',
  'incident.deleted': 'Incident deleted',
  'incident.imported': 'Incidents imported',
  'prevention_plan.created': 'Prevention plan created',
  'prevention_plan.updated': 'Prevention plan updated',
};
const TYPE_OPTIONS = [
  ['', 'All changes'],
  ['incident', 'Incidents'],
  ['incident_import', 'Bulk imports'],
  ['prevention_plan', 'Prevention plans'],
];
const dateTime = value => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value));

function describe(entry) {
  const data = entry.details || {};
  const parts = [];
  if (data.category) parts.push('Category: ' + data.category);
  if (data.status) parts.push('Status: ' + data.status);
  if (data.status_before && data.status_after) {
    parts.push('Status: ' + data.status_before.replaceAll('_', ' ') + ' → ' + data.status_after.replaceAll('_', ' '));
  }
  if (data.record_count !== undefined) parts.push(data.record_count + ' records');
  if (data.evidence_count !== undefined) parts.push(data.evidence_count + ' fictional incidents at proposal');
  if (data.action_code) parts.push('Action: ' + data.action_code.replaceAll('-', ' '));
  if (data.description_changed) parts.push('Incident description edited (text omitted)');
  if (data.owner_changed) parts.push('Coordinator changed (name omitted)');
  if (data.notes_changed) parts.push('Progress notes edited (text omitted)');
  if (Object.prototype.hasOwnProperty.call(data, 'due_date_before')) {
    parts.push('Due date: ' + (data.due_date_before || 'Unspecified') + ' → ' + (data.due_date_after || 'Unspecified'));
  }
  return parts;
}

export default function AuditTrail() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listAuditEvents({ entity_type: type, limit: PAGE_SIZE, offset: page * PAGE_SIZE }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setResult(data);
        setLoading(false);
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setError(reason.message || 'Could not load change history.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [type, page, reload]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return <section className="panel audit-section" aria-labelledby="audit-heading">
    <div className="panel-heading audit-heading">
      <div>
        <h2 id="audit-heading"><Activity size={20} /> Change history</h2>
        <p>Administrator-only history of synthetic incident and prevention-plan changes.</p>
      </div>
      <button type="button" className="button subtle" onClick={() => setReload(n => n + 1)}>
        <RefreshCw size={16} /> Refresh history
      </button>
    </div>
    <div className="audit-toolbar">
      <label htmlFor="audit-type">Event type</label>
      <select id="audit-type" value={type} onChange={event => { setType(event.target.value); setPage(0); }}>
        {TYPE_OPTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
      <span>{result.total.toLocaleString('en-IN')} matching events</span>
    </div>

    {loading && <div className="audit-empty" role="status">Loading change history…</div>}
    {error && <div className="audit-empty audit-error" role="alert">{error}
      <button type="button" onClick={() => setReload(n => n + 1)}>Retry</button>
    </div>}
    {!loading && !error && result.items.length === 0 &&
      <div className="audit-empty">No tracked changes yet. Existing records and past edits predate audit logging.</div>}
    {!loading && !error && <div className="audit-list">
      {result.items.map(event => <article className="audit-entry" key={event.id}>
        <div className="audit-entry-header">
          <strong>{ACTION_LABELS[event.action] || event.action}</strong>
          <time dateTime={event.occurred_at}>{dateTime(event.occurred_at)}</time>
        </div>
        <div className="audit-entry-meta">
          <span>Account: <b>{event.actor_username}</b> ({event.actor_role})</span>
          {event.entity_id && <span>Record ID: <code>{event.entity_id}</code></span>}
        </div>
        {describe(event).length > 0 && <div className="audit-entry-details">
          {describe(event).map(item => <span key={item}>{item}</span>)}
        </div>}
      </article>)}
    </div>}
    <div className="audit-footer">
      <span>Page {Math.min(page + 1, pages)} of {pages}</span>
      <div>
        <button className="button subtle" type="button" aria-label="Previous history page"
          disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /> Previous</button>
        <button className="button subtle" type="button" aria-label="Next history page"
          disabled={loading || page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next <ChevronRight size={16}/></button>
      </div>
    </div>
    <p className="audit-disclaimer">
      This history starts after the feature is enabled; prior changes are not retroactively reconstructed.
      Event records are stored in the same local database, are not tamper-proof,
      and are not a substitute for production-grade immutable audit infrastructure.
      Descriptions, planning notes, and credentials are intentionally not logged.
    </p>
  </section>;
}
