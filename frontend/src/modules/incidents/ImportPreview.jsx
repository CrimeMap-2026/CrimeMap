import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { importIncidents, previewIncidents } from '../../api';
import './import-preview.css';

const STATUS = {
  ready: 'Ready',
  duplicate_existing: 'Already in database',
  duplicate_file: 'Duplicate within file',
  invalid: 'Invalid row',
};
const PAGE_SIZE = 20;

export default function ImportPreview({ disabled = false, onImported }) {
  const [file, setFile] = useState(null);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    setLoading(true);
    setReview(null);
    setError('');
    previewIncidents(file, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setReview(data);
      setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason.message || 'Could not review the selected file.');
      setLoading(false);
    });
    return () => controller.abort();
  }, [file, retry]);

  function chooseFile(event) {
    const chosen = event.target.files?.[0] || null;
    event.target.value = '';
    if (!chosen) return;
    setFile(chosen);
    setVisible(PAGE_SIZE);
    setReview(null);
    setError('');
  }

  function clear() {
    setFile(null);
    setReview(null);
    setError('');
    setVisible(PAGE_SIZE);
  }

  async function confirm() {
    if (!file || !review || loading || importing || disabled ||
      review.invalid > 0 || review.ready === 0) return;
    setImporting(true);
    setError('');
    try {
      // Server revalidates and checks duplicates again when it processes the upload.
      const result = await importIncidents(file, { skipDuplicates: true });
      clear();
      onImported?.(result);
    } catch (reason) {
      setError(reason.message || 'The import was not completed. Review the file and retry.');
      // Refresh preview: the database may have changed since the initial review.
      setRetry(n => n + 1);
    } finally {
      setImporting(false);
    }
  }

  const locked = disabled || importing;

  return <>
    <label className={`button outline upload-button ${locked ? 'disabled' : ''}`}>
      <FileUp size={16} />
      {file ? 'Choose another file' : 'Choose file'}
      <input type="file" accept=".csv,.json" aria-label="Choose CSV or JSON to preview"
        disabled={locked} onChange={chooseFile} hidden />
    </label>

    {file && <section className="import-review" aria-label="Import file review">
      <div className="import-review-heading">
        <div>
          <h3>Review before import</h3>
          <p><strong>{file.name}</strong> · {Math.ceil(file.size / 1024).toLocaleString('en-IN')} KB · Nothing has been saved yet.</p>
        </div>
        <button type="button" className="button subtle" disabled={locked}
          onClick={clear} aria-label="Cancel import review"><X size={16} /> Cancel</button>
      </div>

      {loading && <p className="import-review-message" role="status">Validating rows and checking possible duplicates…</p>}
      {error && <div className="import-review-error" role="alert">{error}
        {!loading && <button type="button" disabled={locked} className="button subtle"
          onClick={() => setRetry(n => n + 1)}><RefreshCw size={15} /> Retry preview</button>}
      </div>}

      {review && <div className="import-review-content">
        <div className="import-review-stats" aria-label="Import review results">
          <div><span>Total rows</span><strong>{review.total}</strong></div>
          <div className="ready"><span>Ready to import</span><strong>{review.ready}</strong></div>
          <div className="duplicates"><span>Possible duplicates</span><strong>{review.duplicate_existing + review.duplicate_file}</strong></div>
          <div className={review.invalid ? 'invalid' : ''}><span>Invalid rows</span><strong>{review.invalid}</strong></div>
        </div>

        {review.invalid > 0 && <div className="import-review-error" role="alert">
          <AlertTriangle size={17} />
          <span><strong>Import blocked.</strong> Fix the invalid rows in your file and select it again. A rejected row prevents importing the entire batch.</span>
        </div>}
        {review.warnings > 0 && <p className="import-review-warning"><AlertTriangle size={16} />
          {review.warnings} row(s) have nonblocking warnings (missing demonstration zone or location outside the example grid). Review the highlighted rows.
        </p>}
        {review.invalid === 0 && review.ready === 0 && <p className="import-review-message">
          No new records to import. All entries appear to already exist or repeat within this file.
        </p>}

        <div className="import-review-table-wrap">
          <table className="import-review-table">
            <thead><tr><th>Row</th><th>Result</th><th>Crime category</th><th>Date (UTC)</th><th>Details</th></tr></thead>
            <tbody>{review.rows.slice(0, visible).map(item => <tr key={item.row}>
              <td>{item.row}</td>
              <td><span className={'import-review-status import-review-status-' + item.status}>{STATUS[item.status] || item.status}</span></td>
              <td>{item.category || '—'}</td>
              <td>{item.occurred_at ? item.occurred_at.replace('T', ' ').replace('Z', ' UTC') : '—'}</td>
              <td className="import-review-details">
                {item.status === 'duplicate_existing' && <span>A possible match is already in the database.</span>}
                {item.status === 'duplicate_file' && <span>Same category, time and coordinates appeared earlier in this file.</span>}
                {item.errors?.map((message, i) => <span key={i}>{message}</span>)}
                {item.warnings?.map((warning, i) => <span className="import-review-caution" key={i}>{warning}</span>)}
                {item.status === 'ready' && !item.warnings?.length && <span>Valid</span>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        {review.rows.length > visible && <button type="button" className="button subtle import-review-more"
          onClick={() => setVisible(n => n + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, review.rows.length - visible)} more rows</button>}

        <div className="import-review-footnote">
          <ShieldCheck size={17} />
          <p>{review.duplicate_rule} Possible duplicates are <strong>skipped</strong>, not overwritten. Review suggestions are advisory, and the server checks again at confirmation.</p>
        </div>
        <div className="import-review-actions">
          <button type="button" className="button subtle" disabled={locked} onClick={clear}>Cancel</button>
          <button type="button" className="button primary"
            disabled={locked || loading || review.invalid > 0 || review.ready === 0}
            onClick={confirm}>
            <CheckCircle2 size={17} />
            {importing ? 'Importing…' : `Import ${review.ready} new record${review.ready === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>}
    </section>}
  </>;
}
