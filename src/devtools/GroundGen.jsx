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
import { planArenaArt, tonemapCover, paintCoverSlab, relLum } from '../game/assetPipeline/arenaArt';

// The cover slab built from a swatch exactly as the game does it (tone-mapped to the contract, then
// outline / bevel / rivets by code), shown three times on a calm ground colour for judging.
function slabPreview(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const ground = { r: 52, g: 60, b: 66 };
        const plan = planArenaArt({ ground });
        const side = 44; // the slab's own size, as in the game (ShooterMode.buildCover)
        const c = document.createElement('canvas');
        c.width = side; c.height = side;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, 0, 0, side, side);
        const mat = { data: tonemapCover(cx.getImageData(0, 0, side, side).data, side, side, relLum(plan.cover.top)), w: side, h: side };
        const slab = paintCoverSlab(44, plan.cover, mat);
        const sc = document.createElement('canvas');
        sc.width = 44; sc.height = 44;
        sc.getContext('2d').putImageData(new ImageData(slab, 44, 44), 0, 0);
        const out = document.createElement('canvas');
        out.width = 44 * 6 + 28; out.height = 44 * 2 + 12;
        const o = out.getContext('2d');
        o.imageSmoothingEnabled = false;
        o.fillStyle = `rgb(${ground.r},${ground.g},${ground.b})`;
        o.fillRect(0, 0, out.width, out.height);
        for (let i = 0; i < 3; i++) o.drawImage(sc, 8 + i * 100, 6, 88, 88);
        resolve(out.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

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
  const [covers, setCovers] = useState({});

  const runCover = async (prompt) => {
    setBusy(`${prompt}|cover`);
    setCovers((r) => ({ ...r, [prompt]: { status: 'running' } }));
    const logs = [];
    try {
      const config = { gameType: 'shooter', sourcePrompt: prompt, themeKey: parsePromptKeywords(prompt).themeKey || null };
      const out = await regenerateAssetSlots({
        config, instruction: prompt, slots: ['cover'],
        onProgress: (text) => { if (text) logs.push(text); },
      });
      const meta = out.meta?.cover || {};
      const img = out.preloadedImages?.cover;
      const preview = img?.src ? await slabPreview(img.src) : null;
      setCovers((r) => ({
        ...r,
        [prompt]: {
          status: 'done', src: img?.src || null, preview, dropped: !!meta.dropped,
          issue: meta.coverIssue || meta.error || '',
          material: meta.qa?.groundMaterial || '', inventory: meta.qa?.inventory || '', defects: meta.qa?.defects || [],
          cost: out.cost?.estUsd ?? null,
          logs: logs.filter((l) => /cover|QA|COST|Retry/i.test(l)).slice(-8),
        },
      }));
    } catch (err) {
      setCovers((r) => ({ ...r, [prompt]: { status: 'error', error: String(err?.message || err), logs } }));
    } finally {
      setBusy(null);
    }
  };

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
      <h1 style={{ margin: 0 }}>Ground + cover generation lab</h1>
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
                </button>{' '}
                <button onClick={() => runCover(w)} disabled={!!busy} style={{ padding: '6px 14px' }}>
                  {busy === `${w}|cover` ? 'Cover…' : covers[w]?.status === 'done' ? 'Redo cover' : 'Cover material'}
                </button>
              </div>
              {covers[w]?.status === 'error' && <p style={{ color: '#ff8a80' }}>Cover error: {covers[w].error}</p>}
              {covers[w]?.status === 'done' && (
                <div style={{ fontSize: 13, marginBottom: 10, borderBottom: '1px solid #333', paddingBottom: 10 }}>
                  <div><b>cover material</b>: {covers[w].dropped ? <span style={{ color: '#ffcc80' }}>dropped (procedural slab) {covers[w].issue}</span> : 'accepted'}{covers[w].cost != null ? ` · ≈$${Number(covers[w].cost).toFixed(3)}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
                    {covers[w].src && <img src={covers[w].src} alt="swatch" style={{ width: 140, borderRadius: 4 }} />}
                    {covers[w].preview && <img src={covers[w].preview} alt="slabs" style={{ width: 300, imageRendering: 'pixelated', borderRadius: 4 }} />}
                  </div>
                  <div style={{ opacity: 0.7 }}>{covers[w].inventory} {covers[w].material && `(${covers[w].material})`} {covers[w].defects.join(', ')}</div>
                </div>
              )}
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
