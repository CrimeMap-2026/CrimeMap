import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Database, FileUp, Filter, LayoutDashboard, UsersRound, LogOut, KeyRound, HeartHandshake,
  MapPinned, Plus, Search, ShieldCheck, Trash2, X, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { CATEGORIES, STATUSES, changeStatus, changeOwnPassword, createIncident, importIncidents, listIncidents, removeIncident, signOut, whoAmI } from './api';
import Login from './modules/auth/Login.jsx';
import './modules/auth/auth.css';
import CrimeMap from './modules/map/CrimeMap.jsx';
import IncidentLocationPicker, { validIncidentPosition } from './modules/incidents/IncidentLocationPicker.jsx';

const AnalyticsDashboard = lazy(() => import('./modules/analytics/AnalyticsDashboard.jsx'));
const Users = lazy(() => import('./modules/auth/Users.jsx'));
const Prevention = lazy(() => import('./modules/prevention/Prevention.jsx'));

const ANALYTIC_ROLES = ['analyst', 'officer', 'admin'];
const WRITE_ROLES = ['officer', 'admin'];

const initialFilters = { category: '', status: '', q: '', limit: 10, offset: 0 };

function initialForm() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
  return {
    category: 'Theft', occurred_at: localTime, latitude: null, longitude: null,
    police_station: '', description: '', status: 'reported',
  };
}

function formattedDate(iso) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

function statusLabel(key) {
  return STATUSES.find(([value]) => value === key)?.[1] || key;
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [view, setView] = useState('incidents');
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState({ items: [], total: 0, limit: 10, offset: 0 });
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const canAnalyze = Boolean(user && ANALYTIC_ROLES.includes(user.role));
  const canWrite = Boolean(user && WRITE_ROLES.includes(user.role));
  const canDelete = user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    whoAmI().then(profile => { if (!cancelled) setUser(profile); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const sessionExpired = () => {
      setUser(null);
      setIsOpen(false);
      setAccountOpen(false);
      setView('incidents');
    };
    window.addEventListener('crimemap-session-expired', sessionExpired);
    return () => window.removeEventListener('crimemap-session-expired', sessionExpired);
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    listIncidents(filters, controller.signal)
      .then((result) => { setData(result); setLoading(false); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setNotice({ type: 'error', text: error.message });
        setLoading(false);
      });
    return () => controller.abort();
  }, [filters, refresh, user]);

  async function logout() {
    try {
      await signOut();
    } finally {
      setUser(null);
      setIsOpen(false);
      setAccountOpen(false);
      setView('incidents');
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setAccountError('');
    setPasswordBusy(true);
    try {
      await changeOwnPassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setAccountOpen(false);
      setUser(null); // Password changes revoke active sessions server-side.
    } catch (reason) {
      setAccountError(reason.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  function changeFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value, offset: 0 }));
  }

  function feedback(type, text) {
    setNotice({ type, text });
  }

  async function submitIncident(event) {
    event.preventDefault();
    if (!validIncidentPosition(form.latitude, form.longitude)) {
      setFormError('Choose a location by placing a pin on the map before saving.');
      return;
    }
    setFormError('');
    setBusy(true);
    try {
      await createIncident({
        ...form,
        occurred_at: new Date(form.occurred_at).toISOString(),
        latitude: form.latitude,
        longitude: form.longitude,
        police_station: form.police_station || null,
        description: form.description || null,
      });
      feedback('success', 'Synthetic incident added successfully.');
      setIsOpen(false);
      setForm(initialForm());
      setFormError('');
      setRefresh((value) => value + 1);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const result = await importIncidents(file);
      feedback('success', `${result.imported} synthetic records imported successfully.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      feedback('error', error.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function handleStatus(id, nextStatus) {
    setBusy(true);
    try {
      await changeStatus(id, nextStatus);
      feedback('success', 'Incident status updated.');
      setRefresh((value) => value + 1);
    } catch (error) {
      feedback('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this synthetic incident permanently?')) return;
    setBusy(true);
    try {
      await removeIncident(id);
      feedback('success', 'Synthetic incident deleted.');
      setRefresh((value) => value + 1);
    } catch (error) {
      feedback('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <div className="auth-loading" role="status">Checking CrimeMap session…</div>;
  if (!user) return <Login onLogin={profile => { setUser(profile); setView('incidents'); setRefresh(n => n + 1); }} />;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="logo"><span className="logo-symbol"><MapPinned size={22} /></span><span>Crime<span className="accent">Map</span><small>INTELLIGENCE PLATFORM</small></span></div>
        <div className="nav-title">WORKSPACE</div>
        <button type="button" className={`nav-item ${view === 'incidents' ? 'selected' : ''}`} onClick={() => setView('incidents')}><Database size={17} /> Incidents <span className="nav-current">01</span></button>
        <button type="button" className={`nav-item ${view === 'map' ? 'selected' : ''}`} onClick={() => setView('map')}><MapPinned size={17} /> Geospatial intelligence <span className="nav-current">02</span></button>
        {canAnalyze && <button type="button" className={`nav-item ${view === 'analytics' ? 'selected' : ''}`} aria-current={view === 'analytics' ? 'page' : undefined} onClick={() => setView('analytics')}><LayoutDashboard size={17} /> Analytics <span className="nav-current">03</span></button>}
        {canAnalyze && <button type="button" className={`nav-item ${view === 'prevention' ? 'selected' : ''}`} aria-current={view === 'prevention' ? 'page' : undefined} onClick={() => setView('prevention')}><HeartHandshake size={17} /> Prevention planner <span className="nav-current">04</span></button>}
        {isAdmin && <button type="button" className={`nav-item ${view === 'users' ? 'selected' : ''}`} aria-current={view === 'users' ? 'page' : undefined} onClick={() => setView('users')}><UsersRound size={17} /> User management <span className="nav-current">ADM</span></button>}
        <div className="sidebar-bottom"><ShieldCheck size={17} /><span>{user.username}<small>{user.role} · Synthetic development data</small></span></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><span className="breadcrumb">CrimeMap <span>/</span> {view === 'map' ? 'Geospatial view' : view === 'analytics' ? 'Analysis' : view === 'prevention' ? 'Decision support' : view === 'users' ? 'Administration' : 'Data management'} <span>/</span> <strong>{view === 'map' ? 'Geospatial intelligence' : view === 'analytics' ? 'Analytics' : view === 'prevention' ? 'Prevention planner' : view === 'users' ? 'Users' : 'Incidents'}</strong></span><div className="auth-actions"><span className="auth-role-chip">{user.role}</span><button type="button" className="button subtle" onClick={() => setAccountOpen(true)}><KeyRound size={16} /> Password</button><button type="button" className="button subtle" onClick={logout}><LogOut size={16} /> Sign out</button></div></header>
        <div className="content">
          {view === 'users' && isAdmin ? <Suspense fallback={<div className="panel empty" role="status">Loading user management…</div>}><Users currentUser={user} /></Suspense> : view === 'prevention' && canAnalyze ? <Suspense fallback={<div className="panel empty" role="status">Loading synthetic prevention planner…</div>}><Prevention canWrite={canWrite} refresh={refresh} /></Suspense> : view === 'analytics' && canAnalyze ? <Suspense fallback={<div className="panel empty" role="status">SYNTHETIC DEMONSTRATION DATA · Loading analytics…</div>}><AnalyticsDashboard refresh={refresh} /></Suspense> : view === 'map' ? <CrimeMap refresh={refresh} canAnalyze={canAnalyze} /> : <>
          <div className="heading-row">
            <div><div className="eyebrow">MODULE 01 · INCIDENT MANAGEMENT</div><h1>Crime incident records</h1><p className="intro">Manage location-based incident data for mapping and analysis.</p></div>
            {canWrite && <button className="button primary" onClick={() => { setFormError(''); setIsOpen(true); }}><Plus size={17} /> Add incident</button>}
          </div>

          <div className="demo-warning"><AlertCircle size={19} /><div><strong>Synthetic demonstration data</strong><span>These records are generated for development and testing. They do not represent real crimes or police reports in Puducherry.</span></div></div>

          {notice && <div className={`notice ${notice.type}`} role="status">{notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{notice.text}</span><button aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={16} /></button></div>}

          <section className="stats-grid" aria-label="Incident overview">
            <div className="stat"><div className="stat-top"><span>Matching incidents</span><Database size={18} /></div><strong>{data.total}</strong><small>Records matching filters</small></div>
            <div className="stat"><div className="stat-top"><span>Showing on page</span><Filter size={18} /></div><strong>{data.items.length}</strong><small>Page size: {filters.limit} incidents</small></div>
            <div className="stat"><div className="stat-top"><span>Data classification</span><ShieldCheck size={18} /></div><strong className="stat-word">Synthetic</strong><small>Demo / testing only</small></div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h2>Incident registry</h2><p>Search and filter the records in your database.</p></div><span className="record-tag">{data.total} records</span></div>
            <div className="filters">
              <label className="search-field"><Search size={18} /><input aria-label="Search description or zone" placeholder="Search description or zone…" value={filters.q} onChange={(e) => changeFilter('q', e.target.value)} /></label>
              <select aria-label="Filter by category" value={filters.category} onChange={(e) => changeFilter('category', e.target.value)}><option value="">All crime categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter by status" value={filters.status} onChange={(e) => changeFilter('status', e.target.value)}><option value="">All statuses</option>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button className="button subtle" onClick={() => setFilters(initialFilters)} title="Reset filters"><X size={16} /> Clear</button>
            </div>
            <div className="table-wrap"><table><thead><tr><th>INCIDENT ID</th><th>CATEGORY</th><th>DATE & TIME (IST)</th><th>AREA / ZONE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
              {loading ? <tr><td colSpan={6} className="empty">Loading incidents…</td></tr> : data.items.length === 0 ? <tr><td colSpan={6} className="empty">No incidents found. Add one or import the sample dataset.</td></tr> : data.items.map((incident) => <tr key={incident.id}>
                <td><strong className="mono">{incident.id.startsWith('DEMO-') ? incident.id : incident.id.slice(0, 8)}</strong><span className="subcell">Synthetic record</span></td>
                <td><span className="category-chip">{incident.category}</span></td>
                <td>{formattedDate(incident.occurred_at)}</td>
                <td>{incident.police_station || '—'}<span className="subcell mono">{incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}</span></td>
                <td><span className={`status-tag ${incident.status}`}>{statusLabel(incident.status)}</span></td>
                <td><div className="actions">{canWrite ? <select disabled={busy} aria-label={`Change status of ${incident.id}`} value={incident.status} onChange={(e) => handleStatus(incident.id, e.target.value)}>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className="map-status">Read only</span>}{canDelete && <button disabled={busy} className="icon-button" aria-label={`Delete ${incident.id}`} title="Delete synthetic incident" onClick={() => handleDelete(incident.id)}><Trash2 size={16} /></button>}</div></td>
              </tr>)}</tbody></table></div>
            <div className="table-footer"><span>Showing {data.total ? data.offset + 1 : 0}–{Math.min(data.offset + data.items.length, data.total)} of {data.total}</span><div className="pagination"><button className="button subtle" disabled={filters.offset === 0 || loading} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}><ArrowLeft size={15} /> Previous</button><button className="button subtle" disabled={filters.offset + filters.limit >= data.total || loading} onClick={() => setFilters((current) => ({ ...current, offset: current.offset + current.limit }))}>Next <ArrowRight size={15} /></button></div></div>
          </section>

          {canWrite && <section className="import-panel"><div className="import-icon"><FileUp size={21} /></div><div><h3>Import incident data</h3><p>Upload a CSV or JSON file containing up to 1,000 synthetic records (maximum 2 MB). All rows are checked before anything is imported.</p><a href="/sample-data/synthetic_incidents.csv" download>Download example CSV</a></div><label className={`button outline upload-button ${busy ? 'disabled' : ''}`}><FileUp size={16} /> {busy ? 'Please wait…' : 'Choose file'}<input disabled={busy} aria-label="Import CSV or JSON incidents" type="file" accept=".csv,.json" onChange={handleImport} hidden /></label></section>}
          <footer className="footer">CrimeMap · Modules 01–04 <span>Designed for geospatial intelligence prototyping · No real incident data</span></footer>
          </>}
        </div>
      </main>

      {isOpen && canWrite && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setIsOpen(false); }}><div className="modal incident-entry-modal" role="dialog" aria-modal="true" aria-labelledby="form-title"><div className="modal-heading"><div><div className="eyebrow">SYNTHETIC INCIDENT</div><h2 id="form-title">Add a record</h2></div><button className="icon-button" disabled={busy} aria-label="Close form" onClick={() => setIsOpen(false)}><X size={20} /></button></div><form onSubmit={submitIncident}>
        <div className="modal-fields"><label>Crime category<select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Date and time (your local time)<input type="datetime-local" required value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></label>
        <IncidentLocationPicker
          latitude={form.latitude} longitude={form.longitude} disabled={busy}
          onChange={({ latitude, longitude }) => {
            setForm(previous => ({ ...previous, latitude, longitude }));
            setFormError('');
          }}
        />
        <label>Demonstration zone (optional)<input type="text" maxLength={120} placeholder="e.g. Demo Zone A" value={form.police_station} onChange={(e) => setForm({ ...form, police_station: e.target.value })} /></label>
        <label>Notes (optional)<textarea rows={3} maxLength={2000} placeholder="Synthetic test description…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        {formError && <div className="incident-form-error" role="alert">{formError}</div>}
        <div className="modal-footer">
          <button type="button" className="button subtle" disabled={busy} onClick={() => setIsOpen(false)}>Cancel</button>
          <button className="button primary" disabled={busy || !validIncidentPosition(form.latitude, form.longitude)} type="submit">
            <Plus size={17} /> {busy ? 'Saving…' : 'Create record'}
          </button>
        </div>
      </form></div></div>}
      {accountOpen && <div className="auth-account-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !passwordBusy) setAccountOpen(false); }}>
        <section className="auth-account-panel" role="dialog" aria-modal="true" aria-labelledby="password-heading">
          <h2 id="password-heading">Change your password</h2>
          <p>Your existing login sessions will be revoked. Sign in again with the new password.</p>
          <form className="auth-fields" onSubmit={changePassword}>
            <label>Current password<input type="password" autoComplete="current-password" required value={oldPassword} onChange={e => setOldPassword(e.target.value)} /></label>
            <label>New password (12–128 characters)<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
            {accountError && <div className="auth-error" role="alert">{accountError}</div>}
            <div className="auth-account-buttons"><button type="button" className="button subtle" disabled={passwordBusy} onClick={() => { setAccountOpen(false); setAccountError(''); setOldPassword(''); setNewPassword(''); }}>Cancel</button><button type="submit" className="button primary" disabled={passwordBusy}>Change password</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}

export default App;
