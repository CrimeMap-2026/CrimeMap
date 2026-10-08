import { useEffect, useState } from 'react';
import { Activity, Database, Layers, MapPinned, RotateCcw, ShieldAlert } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchAnalytics, fetchAnalyticsFilters, STATUSES } from '../../api';
import './analytics.css';

const INITIAL_FILTERS = { start_date: '', end_date: '', category: '', status: '', zone: '' };
const STATUS_COLORS = ['#e7bf61', '#6fb6ff', '#68c9ab'];
const axis = { fill: '#a3b8cf', fontSize: 11 };
const tooltipStyle = { background: '#13243a', border: '1px solid #36506e', borderRadius: 8, color: '#e7edf8' };
const statusName = (value) => STATUSES.find(([key]) => key === value)?.[1] || value;
const number = (value) => value.toLocaleString('en-IN');

function ChartCard({ title, subtitle, rows, children, wide = false }) {
  return <section className={`panel analytics-chart-card ${wide ? 'analytics-wide' : ''}`}>
    <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>
    <div className="analytics-chart-body">{children}</div>
    <details className="analytics-values">
      <summary>View chart data</summary>
      <div className="table-wrap"><table><caption>{title} · SYNTHETIC DEMONSTRATION DATA</caption>
        <thead><tr><th scope="col">Bucket</th><th scope="col">Incidents</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}><th scope="row">{row.label}</th><td>{number(row.count)}</td></tr>)}</tbody>
      </table></div>
    </details>
    <div className="analytics-chart-label">SYNTHETIC DEMONSTRATION DATA</div>
  </section>;
}

function CountBars({ rows, color = '#6fb6ff', horizontal = false }) {
  const height = horizontal ? Math.max(260, rows.length * 38) : 280;
  return <div style={{ height, minWidth: 0 }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 10, right: 20, left: 0, bottom: 10 }} accessibilityLayer>
        <CartesianGrid stroke="#263750" strokeDasharray="3 3" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? <>
          <XAxis type="number" allowDecimals={false} tick={axis} />
          <YAxis type="category" dataKey="label" width={115} tick={axis} tickFormatter={value => value.length > 17 ? `${value.slice(0, 16)}…` : value} />
        </> : <>
          <XAxis dataKey="label" tick={axis} minTickGap={18} />
          <YAxis allowDecimals={false} tick={axis} width={36} />
        </>}
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e7edf8' }} cursor={{ fill: '#ffffff08' }} formatter={value => [number(value), 'Incidents']} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" name="Incidents" fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export default function AnalyticsDashboard({ refresh = 0 }) {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [options, setOptions] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const invalidRange = filters.start_date && filters.end_date && filters.start_date > filters.end_date;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    if (invalidRange) {
      setLoading(false);
      return () => controller.abort();
    }
    const query = { ...filters };
    // JSON values distinguish an actual zone name from the missing-zone option.
    if (filters.zone) {
      const zone = JSON.parse(filters.zone);
      query.zone = zone ?? '';
      if (zone === null) query.unspecified_zone = 'true';
    }
    Promise.all([
      fetchAnalytics(query, controller.signal),
      fetchAnalyticsFilters(controller.signal),
    ]).then(([overview, available]) => {
      if (controller.signal.aborted) return;
      setData(overview);
      setOptions(available);
      setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason.message || 'Analytics could not be loaded.');
      setLoading(false);
    });
    return () => controller.abort();
  }, [filters, refresh, retry, invalidRange]);

  const update = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const summary = data?.summary;
  const categories = data?.by_category.map(row => ({ ...row, label: row.key })) || [];
  const statuses = data?.by_status.map(row => ({ ...row, label: statusName(row.key) })) || [];
  const dates = data?.by_date.map(row => ({ ...row, label: row.key })) || [];
  const hours = data?.by_hour.map(row => ({ ...row, label: `${row.key}:00` })) || [];
  const zones = data?.by_zone.map(row => ({ ...row, label: row.key ?? 'Unspecified zone' })) || [];

  return <div className="analytics-page">
    <div className="heading-row"><div>
      <div className="eyebrow">MODULE 03 · CRIME ANALYTICS</div>
      <h1>Crime analytics dashboard</h1>
      <p className="intro">Explore categories, time patterns, and investigation statuses in the demonstration dataset.</p>
    </div><button className="button subtle" type="button" onClick={() => setRetry(value => value + 1)} disabled={loading}><RotateCcw size={16} /> Refresh</button></div>

    <div className="demo-warning"><ShieldAlert size={19} /><div>
      <strong>SYNTHETIC DEMONSTRATION DATA</strong>
      <span>Every statistic and chart describes fictional records. These are not verified police intelligence, real crime trends, or predictions.</span>
    </div></div>

    <section className="analytics-filters panel" aria-label="Analytics filters">
      <label>From date (IST)<input type="date" value={filters.start_date} max={filters.end_date || undefined} onChange={e => update('start_date', e.target.value)} /></label>
      <label>To date (IST)<input type="date" value={filters.end_date} min={filters.start_date || undefined} onChange={e => update('end_date', e.target.value)} /></label>
      <label>Crime category<select value={filters.category} onChange={e => update('category', e.target.value)}><option value="">All categories</option>{options?.categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Investigation status<select value={filters.status} onChange={e => update('status', e.target.value)}><option value="">All statuses</option>{options?.statuses.map(value => <option key={value} value={value}>{statusName(value)}</option>)}</select></label>
      <label>Demonstration zone<select value={filters.zone} onChange={e => update('zone', e.target.value)}><option value="">All zones</option>{options?.zones.map(value => <option key={value} value={JSON.stringify(value)}>{value}</option>)}{options?.has_unspecified_zone && <option value="null">Unspecified zone</option>}</select></label>
      <button type="button" className="button subtle" onClick={() => setFilters(INITIAL_FILTERS)}>Clear filters</button>
      <p className="analytics-filter-note">Dates include the whole selected day in Asia/Kolkata (IST). Leave dates blank for all time. Every chart uses the same filters.</p>
    </section>

    <div aria-live="polite" aria-busy={loading}>
      {invalidRange && <div className="notice error" role="alert">From date must be on or before To date.</div>}
      {loading && <div className="panel analytics-state" role="status"><span className="analytics-spinner" aria-hidden="true" /> Loading demonstration analytics…</div>}
      {error && <div className="panel analytics-state" role="alert"><h2>Analytics unavailable</h2><p>{error}</p><button type="button" className="button subtle" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
    </div>

    {!loading && !error && !invalidRange && summary && <>
      <section className="stats-grid analytics-stats" aria-label="Synthetic incident summary">
        <div className="stat"><div className="stat-top"><span>Total matching incidents</span><Database size={18} /></div><strong>{number(summary.total_incidents)}</strong><small>All matching synthetic records</small></div>
        <div className="stat"><div className="stat-top"><span>Crime categories</span><Layers size={18} /></div><strong>{number(summary.category_count)}</strong><small>Categories with matching incidents</small></div>
        <div className="stat"><div className="stat-top"><span>Most frequent category</span><Activity size={18} /></div><strong className="stat-word">{summary.most_frequent_category || '—'}</strong><small>{summary.top_categories.length > 1 ? `Tied: ${summary.top_categories.join(', ')} · ${number(summary.most_frequent_count)} each` : `${number(summary.most_frequent_count)} matching incidents`}</small></div>
        <div className="stat"><div className="stat-top"><span>Demonstration zones</span><MapPinned size={18} /></div><strong>{number(summary.zone_count)}</strong><small>Distinct named zones · {number(summary.unspecified_zone_count)} unspecified records</small></div>
      </section>

      {summary.total_incidents === 0 ? <div className="panel analytics-state" role="status"><h2>No matching demonstration incidents</h2><p>Change or clear the filters, or add synthetic records in Incidents.</p><button type="button" className="button subtle" onClick={() => setFilters(INITIAL_FILTERS)}>Clear filters</button></div> : <div className="analytics-chart-grid">
        <ChartCard title="Incidents by crime category" subtitle="Counts across all matching synthetic records" rows={categories}><CountBars rows={categories} horizontal /></ChartCard>
        <ChartCard title="Investigation status distribution" subtitle="Demonstration case statuses" rows={statuses}>
          <div className="analytics-donut"><ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer>
            <Pie data={statuses} dataKey="count" nameKey="label" innerRadius="48%" outerRadius="72%" paddingAngle={2} stroke="#101b2b" isAnimationActive={false}>{statuses.map((row, index) => <Cell key={row.key} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />)}</Pie>
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e7edf8' }} formatter={(value, name) => [`${number(value)} (${(value / summary.total_incidents * 100).toFixed(1)}%)`, name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart></ResponsiveContainer></div>
        </ChartCard>
        <ChartCard title="Incident trends over time" subtitle={`Counts by ${data.trend_interval} · Asia/Kolkata (IST) · zero-count periods included`} rows={dates} wide>
          <div className="analytics-trend"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dates} margin={{ top: 10, right: 20, left: 0, bottom: 10 }} accessibilityLayer>
            <CartesianGrid stroke="#263750" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={axis} minTickGap={35} interval="preserveStartEnd" padding={{ left: 32, right: 32 }} />
            <YAxis tick={axis} allowDecimals={false} width={36} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e7edf8' }} formatter={value => [number(value), 'Incidents']} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="linear" dataKey="count" name="Incidents" stroke="#68c9d8" fill="#68c9d8" fillOpacity={0.15} dot={{ r: dates.length < 32 ? 3 : 0 }} isAnimationActive={false} />
          </AreaChart></ResponsiveContainer></div>
        </ChartCard>
        <ChartCard title="Incidents by hour of day" subtitle="Local occurrence hour · Asia/Kolkata (IST), 00–23" rows={hours}><CountBars rows={hours} color="#ac93ff" /></ChartCard>
        <ChartCard title="Incidents by demonstration zone" subtitle="Missing zone values are included as Unspecified zone" rows={zones}><div className="analytics-zone-scroll"><CountBars rows={zones} color="#68c9ab" horizontal /></div></ChartCard>
      </div>}
      <p className="analytics-footnote">SYNTHETIC DEMONSTRATION DATA · Database aggregates, without incident pagination limits. Named zones come from the existing demonstration zone field; they do not imply official police boundaries.</p>
    </>}
  </div>;
}
