// Ground-gate calibration page (open /?calibrate=ground, then press Run).
//
// Runs the REAL ground review (qa.js reviewGround -> /api/generate) on labelled fixtures
// (public/fixtures/ground/manifest.json): the stored scene plates and synthetic negatives must be
// REJECTED, real floors and crops inside the painted floor must be ACCEPTED. It uses whichever
// Gemini access the deployment already has (production's server gateway), so nothing is pasted
// anywhere and no .env key is involved. Vision calls only (~$0.002 each; 16 images x runs).
// Acceptance: 0 false accepts across all runs and >= 90 % true accepts.
import { useState } from 'react';
import { reviewGround } from '../game/assetPipeline/qa';
import { groundVerdict } from '../game/assetPipeline/groundGate';

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('read failed'));
  r.readAsDataURL(blob);
});

export default function GroundCalibration() {
  const runsParam = Number(new URLSearchParams(window.location.search).get('runs'));
  const runs = Number.isFinite(runsParam) && runsParam >= 1 && runsParam <= 5 ? Math.floor(runsParam) : 2;
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true); setDone(false); setError(''); setRows([]);
    try {
      const manifest = await (await fetch('/fixtures/ground/manifest.json')).json();
      for (const item of manifest) {
        const blob = await (await fetch(`/fixtures/ground/${item.file}`)).blob();
        const dataUrl = await toDataUrl(blob);
        const results = [];
        for (let i = 0; i < runs; i++) {
          const review = await reviewGround(dataUrl, { label: 'qa:ground-calibration' });
          const v = groundVerdict(review);
          results.push({ ok: v.ok, reason: v.reason, inventory: review?.inventory || '', defects: review?.defects || [], material: review?.groundMaterial || '' });
        }
        setRows((prev) => [...prev, { ...item, results }]);
      }
      setDone(true);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const rejectRows = rows.filter((r) => r.expect === 'reject');
  const passRows = rows.filter((r) => r.expect === 'pass');
  const falseAccepts = rejectRows.reduce((n, r) => n + r.results.filter((x) => x.ok).length, 0);
  const trueAccepts = passRows.reduce((n, r) => n + r.results.filter((x) => x.ok).length, 0);
  const passTotal = passRows.reduce((n, r) => n + r.results.length, 0);
  const rate = passTotal ? trueAccepts / passTotal : 0;
  const verdict = done ? (falseAccepts === 0 && rate >= 0.9 ? 'PASS' : 'FAIL') : null;

  const cell = { border: '1px solid #444', padding: '4px 8px', verticalAlign: 'top', fontSize: 13 };
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#101418', color: '#e8ecf1', minHeight: '100vh', padding: 24 }}>
      <h1 style={{ margin: 0 }}>Ground gate calibration</h1>
      <p style={{ opacity: 0.8 }}>
        Runs the real vision gate on labelled images ({runs} run(s) each, vision calls only, roughly $0.002 each).
        Must REJECT scene plates and synthetic negatives, ACCEPT real floors and crops inside the floor.
      </p>
      <button onClick={run} disabled={busy} style={{ padding: '10px 18px', fontSize: 16 }}>{busy ? `Running… ${rows.length}/16 images` : 'Run calibration'}</button>
      {error && <p style={{ color: '#ff8a80' }}>Error: {error}</p>}
      {verdict && (
        <h2 data-testid="calibration-verdict" style={{ color: verdict === 'PASS' ? '#7CFFB2' : '#ff8a80' }}>
          {verdict}: false accepts {falseAccepts} (must be 0), true accepts {trueAccepts}/{passTotal} ({Math.round(rate * 100)} %, must be ≥ 90 %)
        </h2>
      )}
      <table style={{ borderCollapse: 'collapse', marginTop: 16, width: '100%' }}>
        <thead>
          <tr><th style={cell}>file</th><th style={cell}>expect</th><th style={cell}>got (per run)</th><th style={cell}>what the model saw (run 1)</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const wrong = r.expect !== 'ambiguous' && r.results.some((x) => (r.expect === 'pass') !== x.ok);
            return (
              <tr key={r.file} style={{ background: wrong ? '#3a1d1d' : 'transparent' }}>
                <td style={cell}>{r.file}</td>
                <td style={cell}>{r.expect}</td>
                <td style={cell}>{r.results.map((x, i) => <div key={i}>{x.ok ? '✓ accepted' : `✗ ${x.reason}`}</div>)}</td>
                <td style={cell}>{r.results[0]?.inventory} <em style={{ opacity: 0.7 }}>({r.results[0]?.material})</em></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {done && <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.8 }}>{JSON.stringify(rows.map((r) => ({ file: r.file, expect: r.expect, got: r.results.map((x) => (x.ok ? 'accept' : x.reason)) })), null, 1)}</pre>}
    </div>
  );
}
