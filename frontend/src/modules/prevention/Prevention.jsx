import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, BookOpen, CalendarDays, CheckCircle2, ClipboardList,
  Download, Lightbulb, Plus, Printer, RefreshCw, ShieldCheck, Target, X,
} from 'lucide-react';
import {
  CATEGORIES, createPreventionPlan, fetchAnalyticsFilters,
  fetchPreventionInsights, fetchPreventionPlans, updatePreventionPlan,
} from '../../api';
import PreventionCountReview from './PreventionCountReview.jsx';
import './prevention.css';

const INITIAL_FILTERS = { zone: '', category: '', start_date: '', end_date: '' };
const MISSING_ZONE = '__unspecified__';
const LABELS = {
  proposed: 'Proposed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const TRANSITIONS = {
  proposed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const number = value => Number(value || 0).toLocaleString('en-IN');
const safeFileCell = value => {
  // Escape formula-like input so spreadsheet apps do not execute user-supplied text.
  const plain = String(value ?? '');
  const escaped = /^\s*[=+@-]/.test(plain) ? "'" + plain : plain;
  return '"' + escaped.replaceAll('"', '""') + '"';
};

function exportPlanCsv(plans) {
  const columns = [
    ['id', 'Plan ID'], ['zone', 'Demonstration zone'], ['category', 'Category'],
    ['title', 'Preventive measure'], ['status', 'Status'], ['owner', 'Assigned coordinator'],
    ['due_date', 'Due date'], ['evidence_count', 'Synthetic incidents at creation'],
    ['rationale', 'Evidence and limitations'], ['notes', 'Progress notes'],
    ['created_at', 'Created (UTC)'],
  ];
  const rows = [
    columns.map(([, title]) => safeFileCell(title)).join(','),
    ...plans.map(plan => columns.map(([key]) => safeFileCell(plan[key])).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'crimemap-synthetic-prevention-plans.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PlanCard({ plan, canWrite, saving, onStatus, onEdit, onReview }) {
  return <article className="prevention-plan">
    <div className="prevent-plan-heading">
      <span className={'prevent-status prevent-status-' + plan.status}>{LABELS[plan.status]}</span>
      <span className="prevention-small">{plan.category} · {plan.zone === MISSING_ZONE ? 'Unspecified zone' : plan.zone}</span>
    </div>
    <h3>{plan.title}</h3>
    <p className="prevent-rationale">{plan.rationale}</p>
    <dl className="prevention-details">
      <div><dt>Coordinator</dt><dd>{plan.owner}</dd></div>
      <div><dt>Due date</dt><dd>{plan.due_date || 'Not set'}</dd></div>
      <div><dt>Observed at creation</dt><dd>{number(plan.evidence_count)} fictional incidents</dd></div>
      <div><dt>Created (UTC)</dt><dd>{plan.created_at.slice(0, 16).replace('T', ' ')}</dd></div>
    </dl>
    {plan.notes && <p className="prevent-notes">Notes: {plan.notes}</p>}
    {(canWrite || plan.status === 'completed') && <div className="prevent-plan-actions">
      {canWrite && TRANSITIONS[plan.status].map(status => <button type="button" className="button subtle"
        key={status} disabled={saving} onClick={() => onStatus(plan, status)}>
        {status === 'completed' && <CheckCircle2 size={15} />}
        {status === 'in_progress' ? 'Start action' : status === 'completed' ? 'Mark completed' : 'Cancel plan'}
      </button>)}
      {canWrite && <button type="button" className="button subtle" disabled={saving} onClick={() => onEdit(plan)}>Edit details</button>}
      {plan.status === 'completed' && <button type="button" className="button outline" onClick={() => onReview(plan)}>
        <CalendarDays size={15}/> Review observed counts
      </button>}
    </div>}
  </article>;
}

export default function Prevention({ canWrite = false, refresh = 0 }) {
  const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [options, setOptions] = useState(null);
  const [insights, setInsights] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [insightsError, setInsightsError] = useState('');
  const [plansError, setPlansError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [planRefresh, setPlanRefresh] = useState(0);
  const [createDraft, setCreateDraft] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [reviewPlan, setReviewPlan] = useState(null);
  const [working, setWorking] = useState(false);
  const [updating, setUpdating] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchAnalyticsFilters(controller.signal).then(value => {
      if (!controller.signal.aborted) setOptions(value);
    }).catch(() => { /* Zone choices are optional; empty filter still works. */ });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setInsightsError('');
    setLoadingInsights(true);
    fetchPreventionInsights(filters, controller.signal).then(value => {
      if (!controller.signal.aborted) { setInsights(value); setLoadingInsights(false); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setInsightsError(reason.message); setLoadingInsights(false); }
    });
    return () => controller.abort();
  }, [filters, refresh, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setPlansError('');
    setLoadingPlans(true);
    fetchPreventionPlans(controller.signal).then(value => {
      if (!controller.signal.aborted) { setPlans(value); setLoadingPlans(false); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setPlansError(reason.message); setLoadingPlans(false); }
    });
    return () => controller.abort();
  }, [planRefresh, retry, refresh]);

  const counts = useMemo(() => ({
    proposed: plans.filter(p => p.status === 'proposed').length,
    active: plans.filter(p => p.status === 'in_progress').length,
    completed: plans.filter(p => p.status === 'completed').length,
  }), [plans]);
  const pending = JSON.stringify(draftFilters) !== JSON.stringify(filters);
  const dateInvalid = Boolean(draftFilters.start_date && draftFilters.end_date &&
    draftFilters.start_date > draftFilters.end_date);

  function applyFilters(event) {
    event.preventDefault();
    if (dateInvalid) { setMessage('From date cannot be later than To date.'); return; }
    setMessage('');
    setFilters({ ...draftFilters });
  }

  function pickAction(observation, action) {
    setMessage('');
    setCreateDraft({
      zone: observation.zone,
      category: observation.category,
      action_code: action.code,
      action_title: action.title,
      owner: '', due_date: '', notes: '',
      start_date: filters.start_date, end_date: filters.end_date,
      evidence_count: observation.count,
    });
  }

  async function create(event) {
    event.preventDefault();
    if (!createDraft) return;
    setWorking(true);
    setMessage('');
    try {
      const { action_title, evidence_count, ...fields } = createDraft;
      await createPreventionPlan({ ...fields, due_date: fields.due_date || null,
        notes: fields.notes || null, start_date: fields.start_date || null,
        end_date: fields.end_date || null });
      setCreateDraft(null);
      setMessage('Prevention action plan saved. It is a human-reviewable proposal, not an automatic instruction.');
      setPlanRefresh(n => n + 1);
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }

  async function changeStatus(plan, status) {
    setUpdating(plan.id);
    setMessage('');
    try {
      await updatePreventionPlan(plan.id, { status });
      setPlanRefresh(n => n + 1);
      setMessage('Action status updated.');
    } catch (error) { setMessage(error.message); }
    finally { setUpdating(''); }
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editDraft) return;
    setUpdating(editDraft.id);
    setMessage('');
    try {
      await updatePreventionPlan(editDraft.id, {
        owner: editDraft.owner, due_date: editDraft.due_date || null,
        notes: editDraft.notes || null,
      });
      setEditDraft(null);
      setPlanRefresh(n => n + 1);
      setMessage('Action plan details saved.');
    } catch (error) { setMessage(error.message); }
    finally { setUpdating(''); }
  }

  return <div className="prevention-page">
    <div className="heading-row prevention-heading">
      <div>
        <div className="eyebrow">MODULE 04 · HUMAN-REVIEWED DECISION SUPPORT</div>
        <h1>Prevention & action planner</h1>
        <p className="intro">From descriptive incident patterns to transparent, trackable community-prevention proposals.</p>
      </div>
      <div className="prevention-heading-actions">
        <button type="button" className="button subtle" onClick={() => { setRetry(n => n + 1); setMessage(''); }}><RefreshCw size={16}/> Refresh</button>
        <button type="button" className="button subtle" onClick={() => window.print()}><Printer size={16}/> Print summary</button>
        <button type="button" className="button subtle" disabled={!plans.length} onClick={() => exportPlanCsv(plans)}><Download size={16}/> Export plans</button>
      </div>
    </div>
    <div className="demo-warning">
      <AlertCircle size={20}/>
      <div><strong>SYNTHETIC DATA · ADVISORY SUGGESTIONS ONLY</strong>
        <span>These examples are not verified Puducherry incidents, forecasts, crime-risk scores or deployment orders. Prevention measures require consultation, officer review and authorized data before real use.</span>
      </div>
    </div>
    <section className="stats-grid prevention-stats" aria-label="Prevention dashboard totals">
      <div className="stat"><div className="stat-top"><span>Filtered incidents</span><Target size={18}/></div><strong>{loadingInsights ? '—' : number(insights?.total_matching_incidents)}</strong><small>Fictional records matching filters</small></div>
      <div className="stat"><div className="stat-top"><span>Proposed actions</span><Lightbulb size={18}/></div><strong>{loadingPlans ? '—' : number(counts.proposed)}</strong><small>Awaiting human review</small></div>
      <div className="stat"><div className="stat-top"><span>In progress</span><ClipboardList size={18}/></div><strong>{loadingPlans ? '—' : number(counts.active)}</strong><small>Demonstration activities</small></div>
      <div className="stat"><div className="stat-top"><span>Completed</span><CheckCircle2 size={18}/></div><strong>{loadingPlans ? '—' : number(counts.completed)}</strong><small>Recorded completion, not proven impact</small></div>
    </section>

    <form className="panel prevention-filters" onSubmit={applyFilters} noValidate aria-label="Incident pattern filters">
      <div className="prevention-field"><label htmlFor="prevent-zone">Demonstration zone</label>
        <select id="prevent-zone" value={draftFilters.zone} onChange={e => setDraftFilters(f => ({ ...f, zone: e.target.value }))}>
          <option value="">All zones</option>
          {options?.zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
          {options?.has_unspecified_zone && <option value={MISSING_ZONE}>Unspecified zone</option>}
        </select></div>
      <div className="prevention-field"><label htmlFor="prevent-category">Crime category</label>
        <select id="prevent-category" value={draftFilters.category} onChange={e => setDraftFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="">All categories</option>{CATEGORIES.map(category => <option key={category}>{category}</option>)}
        </select></div>
      <div className="prevention-field"><label htmlFor="prevent-from">From date (IST)</label>
        <input id="prevent-from" type="date" value={draftFilters.start_date} onChange={e => setDraftFilters(f => ({ ...f, start_date: e.target.value }))}/></div>
      <div className="prevention-field"><label htmlFor="prevent-to">To date (IST)</label>
        <input id="prevent-to" type="date" value={draftFilters.end_date} onChange={e => setDraftFilters(f => ({ ...f, end_date: e.target.value }))}/></div>
      <div className="prevention-filter-buttons">
        <button className="button primary" type="submit" disabled={dateInvalid}>Apply filters</button>
        <button className="button subtle" type="button" onClick={() => { setDraftFilters(INITIAL_FILTERS); setFilters(INITIAL_FILTERS); setMessage(''); }}>Clear</button>
      </div>
      {dateInvalid && <p className="prevention-alert" role="alert">From date must be on or before To date.</p>}
      {pending && !dateInvalid && <p className="prevention-pending">Filter edits are not applied yet.</p>}
    </form>
    {message && <div className="notice prevention-notice" role="status"><BookOpen size={17}/>{message}
      <button className="prevent-dismiss" type="button" onClick={() => setMessage('')} aria-label="Dismiss message"><X size={16}/></button></div>}

    <section className="prevention-section" aria-labelledby="observations-heading">
      <div className="prevention-section-heading"><div><h2 id="observations-heading">Patterns & preventive measures</h2><p>Grouped and ranked only by counts in the filtered synthetic dataset. No geographic risk estimate.</p></div><span>{insights?.group_count ?? 0} groups</span></div>
      {loadingInsights && <div className="panel prevention-placeholder" role="status">Analyzing fictional incident records…</div>}
      {insightsError && <div className="panel prevention-alert" role="alert">Could not load prevention suggestions: {insightsError}</div>}
      {!loadingInsights && !insightsError && !insights?.observations.length && <div className="panel prevention-placeholder">No incident groups match these filters. Try a wider time period or another category. No matches does not mean an area is safe.</div>}
      {!loadingInsights && insights && <div className="prevention-grid">
        {insights.observations.map((item, index) => <article className="panel prevention-observation" key={item.zone + '/' + item.category}>
          <div className="prevention-observation-top"><span className="prevent-rank">Observation {index + 1}</span><span className="prevent-bucket">{number(item.count)} incidents · {item.share_percent}% of selection</span></div>
          <h3>{item.zone_label}</h3>
          <div className="prevention-category">{item.category}</div>
          <p className="prevention-card-explain">The dataset contains <strong>{number(item.count)} fictional {item.category.toLowerCase()} records</strong> in this demonstration zone for the selected period.</p>
          <div className="prevention-card-measures">
            <h4>Consider these safeguards</h4>
            {item.actions.map(action => <div className="prevention-action" key={action.code}>
              <strong>{action.title}</strong>
              <p>{action.description}</p>
              <small>Suggested activity indicator: {action.success_metric}</small>
              {canWrite && <button type="button" className="button subtle"
                onClick={() => pickAction(item, action)}><Plus size={15}/> Create action plan</button>}
            </div>)}
          </div>
        </article>)}
      </div>}
      {insights && <details className="panel prevention-method">
        <summary>How these suggestions are generated</summary>
        <p>{insights.methodology}</p>
        <p>Counts may vary when you filter or edit records. Suggested actions come from a fixed, category-specific safeguarding library. Creating a plan captures the supporting count at that moment for transparency. No automated predictions, deployment routes or proof of effectiveness are produced.</p>
      </details>}
    </section>

    <section className="prevention-section prevention-plans-section" aria-labelledby="plan-heading">
      <div className="prevention-section-heading"><div><h2 id="plan-heading">Prevention action board</h2><p>Human-reviewed action lifecycle: proposed → in progress → completed, or cancelled.</p></div><span>{plans.length} plans</span></div>
      {loadingPlans && <div className="panel prevention-placeholder" role="status">Loading saved prevention plans…</div>}
      {plansError && <div className="panel prevention-alert" role="alert">{plansError}</div>}
      {!loadingPlans && !plansError && !plans.length && <div className="panel prevention-placeholder">No prevention plans have been saved yet. {canWrite ? 'Use “Create action plan” on an observation above.' : 'An authorized Officer or Administrator can create proposals.'}</div>}
      {!loadingPlans && !!plans.length && <div className="prevention-board">{plans.map(plan => <PlanCard
        key={plan.id} plan={plan} canWrite={canWrite} saving={updating === plan.id}
        onStatus={changeStatus} onEdit={value => setEditDraft({ ...value, due_date: value.due_date || '', notes: value.notes || '' })}
        onReview={plan => setReviewPlan(plan)}
      />)}</div>}
      {reviewPlan && <PreventionCountReview key={reviewPlan.id} plan={reviewPlan}
        onClose={() => setReviewPlan(null)}/>}
    </section>

    <footer className="prevention-footnote"><ShieldCheck size={17}/> Decision support is advisory. Use authorized data, equity and privacy review, community consultation and appropriate outcome evaluation before implementing real-world measures.</footer>

    {createDraft && <div className="prevention-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !working) setCreateDraft(null); }}>
      <section className="prevention-modal" role="dialog" aria-modal="true" aria-labelledby="create-prevention-title">
        <h2 id="create-prevention-title">Propose preventive action</h2>
        <p className="prevention-modal-subtitle">{createDraft.action_title} · {createDraft.zone === MISSING_ZONE ? 'Unspecified zone' : createDraft.zone}</p>
        <p>Based on {number(createDraft.evidence_count)} matching fictional incidents. You are creating a proposal, not issuing a patrol order.</p>
        <form onSubmit={create} className="prevention-modal-form">
          <label>Responsible coordinator<input required maxLength={100} minLength={2} autoFocus placeholder="e.g. Demo community liaison" value={createDraft.owner} onChange={e => setCreateDraft(f => ({ ...f, owner: e.target.value }))}/></label>
          <label>Review or completion due date (optional)<input type="date" value={createDraft.due_date} onChange={e => setCreateDraft(f => ({ ...f, due_date: e.target.value }))}/></label>
          <label>Planning notes (optional)<textarea maxLength={1000} rows={3} value={createDraft.notes} onChange={e => setCreateDraft(f => ({ ...f, notes: e.target.value }))} placeholder="Objectives, community consultation or evaluation criteria"/></label>
          <div className="prevention-modal-actions"><button type="button" className="button subtle" disabled={working} onClick={() => setCreateDraft(null)}>Cancel</button><button type="submit" className="button primary" disabled={working}>{working ? 'Saving…' : 'Save proposal'}</button></div>
        </form>
      </section>
    </div>}

    {editDraft && <div className="prevention-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !updating) setEditDraft(null); }}>
      <section className="prevention-modal" role="dialog" aria-modal="true" aria-labelledby="edit-prevention-title">
        <h2 id="edit-prevention-title">Edit action details</h2><p>{editDraft.title}</p>
        <form onSubmit={saveEdit} className="prevention-modal-form">
          <label>Coordinator<input required maxLength={100} minLength={2} value={editDraft.owner} onChange={e => setEditDraft(f => ({ ...f, owner: e.target.value }))}/></label>
          <label>Due date<input type="date" value={editDraft.due_date} onChange={e => setEditDraft(f => ({ ...f, due_date: e.target.value }))}/></label>
          <label>Progress notes<textarea maxLength={1000} rows={4} value={editDraft.notes} onChange={e => setEditDraft(f => ({ ...f, notes: e.target.value }))}/></label>
          <div className="prevention-modal-actions"><button type="button" className="button subtle" disabled={Boolean(updating)} onClick={() => setEditDraft(null)}>Cancel</button><button type="submit" className="button primary" disabled={Boolean(updating)}>Save changes</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
