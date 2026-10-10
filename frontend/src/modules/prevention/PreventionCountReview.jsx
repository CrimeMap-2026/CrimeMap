import { useEffect, useState } from 'react';
import { CalendarRange, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { reviewPreventionPlan } from '../../api';
import { DEFAULT_REVIEW_PERIODS, reviewPeriodError } from './review-periods.js';

const format = value => Number(value || 0).toLocaleString('en-IN');

export default function PreventionCountReview({ plan, onClose }) {
  const [draft, setDraft] = useState({ ...DEFAULT_REVIEW_PERIODS });
  const [applied, setApplied] = useState(null);
  const [validation, setValidation] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError('');
    reviewPreventionPlan(plan.id, applied, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      }).catch(reason => {
        if (!controller.signal.aborted) {
          setError(reason.message || 'Could not compare these dates.');
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [plan.id, applied]);

  const setDate = (key, value) => {
    setDraft(previous => ({ ...previous, [key]: value }));
    setValidation('');
  };

  const compare = event => {
    event.preventDefault();
    const problem = reviewPeriodError(draft);
    setValidation(problem);
    if (problem) return;
    setApplied({ ...draft });
  };

  const scale = data ? Math.max(1, data.previous_count, data.followup_count) : 1;
  const width = value => value > 0 ? Math.max(2, 100 * value / scale) + '%' : '0%';
  const pending = applied && JSON.stringify(draft) !== JSON.stringify(applied);

  return <section className="panel prevention-review" aria-labelledby="prevention-review-heading">
    <div className="prevention-review-heading">
      <div>
        <div className="eyebrow"><CalendarRange size={15} /> SYNTHETIC OBSERVATION REVIEW</div>
        <h2 id="prevention-review-heading">Compare counts for a completed plan</h2>
        <p><strong>{plan.title}</strong> · {plan.category} · {plan.zone === '__unspecified__' ? 'Unspecified zone' : plan.zone}</p>
      </div>
      <button type="button" className="button subtle" onClick={onClose}><X size={16} /> Close review</button>
    </div>
    <p className="prevention-review-caution">
      Choose two periods of equal length. These are <strong>manually selected observational windows</strong>,
      not automatically the dates before and after the intervention. Results cannot prove that the plan changed crime levels.
    </p>
    <form className="prevention-review-form" onSubmit={compare} noValidate aria-label="Choose two periods to review synthetic incident counts">
      <fieldset>
        <legend>Earlier period (IST)</legend>
        <div className="prevention-review-date-fields">
          <label htmlFor="review-before-start">Start date
            <input id="review-before-start" type="date" required value={draft.previous_start_date}
              onChange={e => setDate('previous_start_date', e.target.value)}/>
          </label>
          <label htmlFor="review-before-end">End date
            <input id="review-before-end" type="date" required value={draft.previous_end_date}
              onChange={e => setDate('previous_end_date', e.target.value)}/>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Later period (IST)</legend>
        <div className="prevention-review-date-fields">
          <label htmlFor="review-after-start">Start date
            <input id="review-after-start" type="date" required value={draft.followup_start_date}
              onChange={e => setDate('followup_start_date', e.target.value)}/>
          </label>
          <label htmlFor="review-after-end">End date
            <input id="review-after-end" type="date" required value={draft.followup_end_date}
              onChange={e => setDate('followup_end_date', e.target.value)}/>
          </label>
        </div>
      </fieldset>
      <div className="prevention-review-action">
        <button type="submit" className="button primary" disabled={loading}><CalendarRange size={16}/> Compare counts</button>
        <p>Example dates cover September and October 2026. Edit them to match your fictional observations.</p>
      </div>
      {validation && <p className="prevention-review-error" role="alert">{validation}</p>}
      {pending && !validation && <p className="prevention-pending">Date changes have not been applied. Click Compare counts again.</p>}
    </form>
    {loading && <p className="prevention-review-loading" role="status">Counting matching synthetic incidents in both periods…</p>}
    {error && <p className="prevention-review-error" role="alert">{error}
      <button type="button" className="button subtle" onClick={() => setApplied({ ...applied })}><RefreshCw size={14}/> Retry</button>
    </p>}
    {data && <div className="prevention-review-result" aria-label="Synthetic incident count comparison">
      <div className="prevention-review-meta">
        <strong>{data.days_per_period} calendar days per period</strong>
        <span>Same category and demonstration zone in both periods</span>
      </div>
      <div className="prevention-review-bars">
        {[
          { label: 'Earlier', count: data.previous_count, start: data.previous_start_date, end: data.previous_end_date, className: 'earlier' },
          { label: 'Later', count: data.followup_count, start: data.followup_start_date, end: data.followup_end_date, className: 'later' },
        ].map(item => <div className="prevention-review-bar-row" key={item.label}>
          <div className="prevention-review-bar-heading">
            <strong>{item.label} period</strong><span>{item.start} – {item.end}</span>
            <b>{format(item.count)} incidents</b>
          </div>
          <div className="prevention-review-bar-track" role="img"
            aria-label={item.label + ' period, ' + item.count + ' fictional incidents'}>
            <div className={'prevention-review-bar ' + item.className} style={{ width: width(item.count) }}/>
          </div>
        </div>)}
      </div>
      <p className="prevention-review-difference">
        Observed count difference: <strong>{data.absolute_change > 0 ? '+' : ''}{format(data.absolute_change)} incidents</strong>
        {data.percent_change === null
          ? <span> · Percentage unavailable because the earlier count is zero.</span>
          : <span> · {data.percent_change > 0 ? '+' : ''}{data.percent_change}% relative to the earlier count.</span>}
      </p>
      <div className="prevention-review-limitations">
        <ShieldAlert size={19}/>
        <div>
          <strong>Descriptive comparison, not prevention effectiveness</strong>
          <p>{data.methodology}</p>
          <ul>{data.limitations.map(text => <li key={text}>{text}</li>)}</ul>
        </div>
      </div>
    </div>}
  </section>;
}
