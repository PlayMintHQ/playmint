// Ground generation lab (open /?calibrate=ground-gen).
//
// Generates the shooter ground (background_far) for a handful of world prompts through the REAL
// pipeline (new texture scaffold -> ground gate -> floor-bake / procedural ladder) and shows each
// result with its verdict, so look AND gate acceptance can be judged on new output.
// Spends image calls (~$0.05-0.09 per world, one plate + vision reviews; a failed gate adds a floor
// roll). Each world has its own button, nothing runs on load.
import { useState } from 'react';
import { regenerateAssetSlots } from '../game/assetPipeline/pipeline';
import { parsePromptKeywords } from '../game/promptUtils';

const WORLDS = [
  'burning cyberpunk rooftop arena shooter',
  'floating sky ruins arena shooter',
  'lava fortress arena shooter',
  'overgrown forest ruins arena shooter',
  'frozen research station arena shooter',
  'desert temple arena shooter',
];

export default function GroundGen() {
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);

  const runOne = async (prompt) => {
    setBusy(prompt);
    setResults((r) => ({ ...r, [prompt]: { status: 'running' } }));
    const logs = [];
    window.__PM_GROUND_DEBUG = [];
    try {
      const config = {
        gameType: 'shooter',
        sourcePrompt: prompt,
        themeKey: parsePromptKeywords(prompt).themeKey || null,
      };
      const out = await regenerateAssetSlots({
        config, instruction: prompt, slots: ['background_far'],
        onProgress: (text) => { if (text) logs.push(text); },
      });
      const meta = out.meta?.background_far || {};
      const img = out.preloadedImages?.background_far;
      setResults((r) => ({
        ...r,
        [prompt]: {
          status: 'done',
          src: img?.src || null,
          size: img ? `${img.naturalWidth}x${img.naturalHeight}` : '',
          role: meta.role || '(none)',
          groundSource: meta.groundSource || '(n/a)',
          groundIssue: meta.groundIssue || '',
          cost: out.cost?.estUsd ?? null,
          subject: out.design?.subjects?.floor || out.design?.subjects?.background_far || '',
          seen: (window.__PM_GROUND_DEBUG || []).map((d) => ({ kind: d.kind, src: d.src, inventory: d.review?.inventory || '', material: d.review?.groundMaterial || '', defects: d.review?.defects || [], pure: d.review?.pureGround })),
          logs: logs.filter((l) => /ground|GATE|QA|COST/i.test(l)).slice(-12),
        },
      }));
    } catch (err) {
      setResults((r) => ({ ...r, [prompt]: { status: 'error', error: String(err?.message || err), logs } }));
    } finally {
      setBusy(null);
    }
  };

  const box = { border: '1px solid #444', borderRadius: 8, padding: 12, background: '#161b22' };
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#101418', color: '#e8ecf1', minHeight: '100vh', padding: 24 }}>
      <h1 style={{ margin: 0 }}>Ground generation lab</h1>
      <p style={{ opacity: 0.8 }}>
        Generates the shooter ground texture for one world per button (about $0.05-0.09 each).
        Shows the final ground, which rung of the ladder produced it, and the gate outcome.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
        {WORLDS.map((w) => {
          const r = results[w];
          return (
            <div key={w} style={box}>
              <strong>{w}</strong>
              <div style={{ margin: '8px 0' }}>
                <button onClick={() => runOne(w)} disabled={!!busy} style={{ padding: '6px 14px' }}>
                  {busy === w ? 'Generating…' : r?.status === 'done' ? 'Regenerate' : 'Generate'}
                </button>
              </div>
              {r?.status === 'error' && <p style={{ color: '#ff8a80' }}>Error: {r.error}</p>}
              {r?.status === 'done' && (
                <>
                  {r.src && <img src={r.src} alt={w} style={{ width: '100%', borderRadius: 4, background: '#000' }} />}
                  <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                    <div>source: <b>{r.groundSource}</b> · role: <b>{r.role}</b> · {r.size}{r.cost != null ? ` · ≈$${Number(r.cost).toFixed(3)}` : ''}</div>
                    {r.groundIssue && <div style={{ color: '#ffcc80' }}>gate: {r.groundIssue}</div>}
                    <div style={{ opacity: 0.7 }}>subject: {r.subject}</div>
                    {r.seen?.map((d, i) => (
                      <div key={i} style={{ marginTop: 8, borderTop: '1px solid #333', paddingTop: 6 }}>
                        <div>gate saw <b>{d.kind}</b>: {d.pure ? 'pure' : 'rejected'} {d.defects.join(', ')}</div>
                        <img src={d.src} alt={d.kind} style={{ width: '100%', borderRadius: 4, background: '#000' }} />
                        <div style={{ opacity: 0.7 }}>{d.inventory} ({d.material})</div>
                      </div>
                    ))}
                    {r.logs?.length > 0 && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, opacity: 0.7 }}>{r.logs.join('\n')}</pre>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
