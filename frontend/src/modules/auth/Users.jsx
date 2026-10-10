import { useEffect, useState } from 'react';
import { CircleUserRound, KeyRound, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { addUser, listUsers, modifyUser, resetUserPassword } from '../../api';
import AuditTrail from './AuditTrail.jsx';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';
import './auth.css';

const ROLES = ['viewer', 'analyst', 'officer', 'admin'];
const DESCRIPTIONS = {
  viewer: 'Records and basic map (read-only)',
  analyst: 'Records, maps and analytics (read-only)',
  officer: 'Analysis, incident entry and status changes',
  admin: 'All permissions, deletion and user management',
};

export default function Users({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [workingId, setWorkingId] = useState('');
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer' });
  const [resetFor, setResetFor] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const passwordDialogRef = useDialogFocus(Boolean(resetFor), () => setResetFor(null), Boolean(workingId));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listUsers(controller.signal).then(result => {
      if (!controller.signal.aborted) { setUsers(result); setLoading(false); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setNotice({ error: true, text: reason.message }); setLoading(false); }
    });
    return () => controller.abort();
  }, [refresh]);

  async function create(event) {
    event.preventDefault();
    setWorkingId('create');
    setNotice(null);
    try {
      await addUser(form.username, form.password, form.role);
      setForm({ username: '', password: '', role: 'viewer' });
      setNotice({ text: 'Account created. Share credentials privately; the account holder should change their password.' });
      setRefresh(n => n + 1);
    } catch (reason) {
      setNotice({ error: true, text: reason.message });
    } finally { setWorkingId(''); }
  }

  async function patch(user, data) {
    if (data.is_active === false && !window.confirm('Disable this account and revoke its sessions?')) return;
    setWorkingId(user.id);
    setNotice(null);
    try {
      await modifyUser(user.id, data);
      setNotice({ text: 'Permissions updated. Existing sessions for this account were revoked.' });
      setRefresh(n => n + 1);
    } catch (reason) {
      setNotice({ error: true, text: reason.message });
    } finally { setWorkingId(''); }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (!resetFor) return;
    setWorkingId(resetFor.id);
    setNotice(null);
    try {
      await resetUserPassword(resetFor.id, resetPassword);
      setNotice({ text: 'Password reset and existing account sessions revoked.' });
      setResetFor(null);
      setResetPassword('');
    } catch (reason) {
      setNotice({ error: true, text: reason.message });
    } finally { setWorkingId(''); }
  }

  return <div className="users-page">
    <div className="heading-row">
      <div><div className="eyebrow">ADMINISTRATION · ACCESS CONTROL</div>
        <h1>User management</h1>
        <p className="intro">Create development accounts, assign least-privilege roles and revoke access.</p>
      </div>
      <button type="button" className="button subtle" onClick={() => setRefresh(n => n + 1)}>
        <RefreshCw size={16} /> Refresh accounts
      </button>
    </div>
    <div className="demo-warning"><ShieldCheck size={18} /><div><strong>Development access only</strong>
      <span>These are local accounts for synthetic CrimeMap data. An operational deployment requires HTTPS, centralized identity, independent audit storage and a full security review.</span>
    </div></div>
    {notice && <div className={'notice ' + (notice.error ? 'error' : '')} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
    <div className="user-admin-layout">
      <section className="panel users-create">
        <div className="panel-heading"><div><h2>Create account</h2><p>No publicly accessible registration.</p></div><Plus size={20} /></div>
        <form className="auth-fields" onSubmit={create}>
          <label>Username<input required type="text" minLength={3} maxLength={40} autoComplete="off"
            value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></label>
          <label>Temporary password (12–128 characters)<input required type="password" minLength={12} maxLength={128} autoComplete="new-password"
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></label>
          <label>Role<select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {ROLES.map(role => <option value={role} key={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}
          </select></label>
          <p className="user-role-description">{DESCRIPTIONS[form.role]}</p>
          <button className="button primary" type="submit" disabled={workingId === 'create'}>
            <Plus size={16} /> {workingId === 'create' ? 'Creating…' : 'Create user'}
          </button>
        </form>
      </section>
      <section className="panel users-table">
        <div className="panel-heading"><div><h2>Accounts</h2><p>Role changes and deactivation revoke active sessions.</p></div><CircleUserRound size={20} /></div>
        {loading ? <div className="map-results-empty">Loading accounts…</div> : <div className="user-list">
          {users.map(user => <div className="user-entry" key={user.id}>
            <div className="user-entry-main">
              <strong>{user.username}{user.id === currentUser.id ? ' (you)' : ''}</strong>
              <span className={user.is_active ? 'user-active' : 'user-inactive'}>{user.is_active ? 'Active' : 'Disabled'}</span>
            </div>
            <div className="user-actions">
              <label>Role<select aria-label={'Role for ' + user.username} value={user.role}
                disabled={Boolean(workingId) || user.id === currentUser.id}
                onChange={e => patch(user, { role: e.target.value })}>
                {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
              </select></label>
              <button type="button" className="button subtle" disabled={Boolean(workingId) || user.id === currentUser.id}
                onClick={() => patch(user, { is_active: !user.is_active })}>{user.is_active ? 'Disable' : 'Enable'}</button>
              <button type="button" className="button subtle" disabled={Boolean(workingId)}
                onClick={() => { setResetFor(user); setResetPassword(''); }}><KeyRound size={15} /> Reset password</button>
            </div>
          </div>)}
        </div>}
      </section>
    </div>
    <AuditTrail />
    {resetFor && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !workingId) setResetFor(null); }}>
      <div ref={passwordDialogRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="modal-heading"><h2 id="reset-title">Reset password for {resetFor.username}</h2></div>
        <form onSubmit={changePassword}>
          <div className="modal-fields"><label>New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={resetPassword}
            onChange={e => setResetPassword(e.target.value)} /></label></div>
          <div className="modal-footer">
            <button type="button" className="button subtle" disabled={Boolean(workingId)} onClick={() => setResetFor(null)}>Cancel</button>
            <button type="submit" className="button primary" disabled={Boolean(workingId)}>Reset and revoke sessions</button>
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
