import { useState } from 'react';
import { CheckCircle2, Download, FileText, ShieldAlert } from 'lucide-react';
import { downloadPresentationReport } from '../../api';
import { presentationReportQuery, REPORT_SECTIONS } from './report-options.js';

export default function ReportDownload({ filters, disabled = false }) {
  const [selected, setSelected] = useState({
    analytics: true, spatial: true, prevention: true,
  });
  const [gridCellSize, setGridCellSize] = useState('1000');
  const [minimum, setMinimum] = useState('2');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function download(event) {
    event.preventDefault();
    setError('');
    setSuccess(false);
    let query;
    try {
      query = presentationReportQuery(filters, selected, gridCellSize, minimum);
    } catch (reason) {
      setError(reason.message);
      return;
    }
    setWorking(true);
    try {
      await downloadPresentationReport(query);
      setSuccess(true);
    } catch (reason) {
      setError(reason.message || 'Could not generate the report.');
    } finally {
      setWorking(false);
    }
  }

  return <details className="panel analytics-report" aria-label="Consolidated presentation PDF">
    <summary><FileText size={20} /> <span>Build presentation PDF</span>
      <small>Choose sections and export one combined report</small></summary>
    <form className="analytics-report-body" onSubmit={download} noValidate>
      <p>The PDF uses the <strong>currently selected Analytics date, category, status and zone filters</strong>.
        It fetches fresh aggregates from the database when you download. No new report page or saved database copy is created.</p>
      <fieldset className="analytics-report-choices">
        <legend>Include these sections</legend>
        {REPORT_SECTIONS.map(([key, label]) => <label key={key}>
          <input type="checkbox" checked={selected[key]}
            onChange={e => {
              setSelected(previous => ({ ...previous, [key]: e.target.checked }));
              setError('');
              setSuccess(false);
            }}/>
          <span>{label}</span>
        </label>)}
      </fieldset>
      {selected.spatial && <div className="analytics-report-grid-controls">
        <label>Geographic grid width
          <select value={gridCellSize} onChange={e => setGridCellSize(e.target.value)}>
            <option value="250">250 m</option>
            <option value="500">500 m</option>
            <option value="1000">1 km</option>
            <option value="2000">2 km</option>
            <option value="5000">5 km</option>
          </select>
        </label>
        <label>Minimum incidents / cell
          <input type="number" min="2" max="1000" step="1"
            value={minimum} onChange={e => setMinimum(e.target.value)}/>
        </label>
      </div>}
      <div className="analytics-report-warning">
        <ShieldAlert size={18}/>
        <p><strong>Fictional demonstration data only.</strong> Geographic findings are from an aligned grid,
          not an OpenStreetMap screenshot or official boundary. Saved plans are filtered by category/zone when selected,
          but not by incident date or investigation status. No causal crime-prevention results are claimed.</p>
      </div>
      <div className="analytics-report-actions">
        <button className="button primary" type="submit"
          disabled={working || disabled || !Object.values(selected).some(Boolean)}>
          <Download size={17} /> {working ? 'Generating PDF…' : 'Download presentation PDF'}
        </button>
        {success && <span className="analytics-report-success" role="status">
          <CheckCircle2 size={16}/> PDF generated and download requested.
        </span>}
      </div>
      {error && <p className="analytics-report-error" role="alert">{error}</p>}
    </form>
  </details>;
}
