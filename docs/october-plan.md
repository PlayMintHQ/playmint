# PlayMint — October 2026 Plan (Oct 19 → Oct 31)

Status: agreed 2026-10-19. Scope order set by client feedback: (1) replace the deprecated
Gemini 2.5 image fallback, (2) restore and verify successful Gemini API requests / credits
in production, (3) tighten the offline/local cache matcher so semantically incompatible
worlds are rejected — then reset cost/timing stats, run a clean benchmark, and start the
Public / Publish / Share scope.

---

## 1. Decisions (confirmed 2026-10-19)

| Question | Decision |
|---|---|
| Production Gemini verification | **Grant access** — developer gets Vercel + Google AI Studio (or Cloud console) access to the billed-key account; verify credits/quota/key directly. |
| 2.5 fallback replacement | **`gemini-3.1-flash-image`** (GA May 2026, same family as the sheet ladder, supports 0.5K/1K/2K/4K). |
| Sheet ladder rung 3 (`gemini-3.1-flash-image`, deprecated Oct 6, 2026) | **A/B in benchmark** via `PM_MODEL_SHEET='gemini-nano-banana-2.1'` overrides (~$0.10 extra); decide with data, no schedule risk. |
| Benchmark scope | **~10-prompt sample**, normal mode (~$3–4), plus 1 cache hit + 1 share-link restore, plus the sheet A/B runs. |
| Public / Publish / Share | **Starts this window, after benchmark sign-off**; full slice may spill into November. |

---

## 2. Findings from the 2026-10-19 audit

These were verified live today against Google's docs and the repo; they shape the phases below.

1. **Deprecation facts moved.**
   - `gemini-2.5-flash-image` EOL was pushed to **Mar 15, 2027** (was Oct 2, 2026);
     Google's recommended replacement is `gemini-3.1-flash-lite-image`.
   - **`gemini-3.1-flash-image` is itself deprecated (announced Oct 6, 2026, no shutdown
     date)** with `gemini-nano-banana-2.1` as the recommended successor.
   - `gemini-3.1-flash-lite-image` (primary slot model) is GA, no shutdown date,
     **1K-only** (0.5K/2K/4K unsupported).
2. **Two slot specs silently 400 today.** `player` requests `imageSize: '0.5K'` and
   `background_far` requests `'2K'`, both on the lite model, which supports neither —
   the provider's field-rejection retry strips them. Every fresh session pays at least one
   wasted round-trip per affected slot, and the "2K is a free resolution lever" note in
   `CLAUDE.md` no longer holds on the lite path.
3. **Production ops gap.** `GET https://playmintai.vercel.app/api/keepalive` answers
   `{ok:false, configured:false, missing:['SUPABASE_SERVICE_ROLE_KEY']}` — the daily cron
   that keeps the free-tier Supabase project awake is inert. Relevant for the publish
   phase (DB auto-pause).
4. **Matcher gap.** `tryMatchedReuse` (`src/game/assetCache/index.js`) accepts an LLM
   verdict (`matchCachedGame`) with only two semantic rejections — ≥2 `WORLD_SLOTS` in
   `replaceSlots` and redraw weight > 5. There is no deterministic check that a known
   theme prompt's world fits the candidate set. `localMatch` (deterministic) is
   conservative but only runs when the LLM verdict is null/failed.
5. **Duplicate-player lead (open).** `pickSheetLayout` (`postprocess.js`) scores
   `cutScore (0..1) + |imageAspect − layoutAspect| × 10` — the aspect penalty dominates the
   gutter-emptiness score, so an off-aspect serve can pick a geometrically close but
   wrong grid instead of the cut-verified one. Reproduces generation-dependently
   (Ice Quest yes, Space Quest no). To be confirmed via `__PM_SHEET_DEBUG` capture +
   `.replay()` ($0) before any code change.

---

## 3. Phases

### Phase 0 — Baseline & repro capture (0.5 day)

- `npm run build` + `npm run lint` (baseline ~46 errors in `src/`; do not add).
- Verify the Action Quest enemy-collision fix live, desktop + mobile: live enemy touch →
  normal Game Over (no freeze); melee/projectile kills still work. Code already passes
  `(player, enemy)` in `PlatformerMode.handlePlayerEnemyCollision` — this is a runtime
  verification, not a code change.
- Capture the Ice Quest duplicate-player repro: `window.__PM_SHEET_DEBUG.download()`
  after the run, then `.replay(i)` to test the `pickSheetLayout` hypothesis at $0.
- Housekeeping: resolve modified `roadmap-status-2026-08-28.txt` and
  `scripts/isolation-test.mjs`; remove untracked `patch.py`.

### Phase 1 — Replace the deprecated 2.5 fallback (1 day) — client priority 1

Files: `src/game/assetPipeline/slotSpecs.js`, `src/game/assetPipeline/providers/geminiImage.js`,
`CLAUDE.md`.

- `GEMINI_IMAGE_FALLBACK_MODEL = 'gemini-3.1-flash-image'` (replaces
  `'gemini-2.5-flash-image'`); update `MODEL_PRICES`, the explanatory comments, and
  `CLAUDE.md` in the same commit.
- Keep the `unavailableImageModels` + `isModelUnavailableError` ladder semantics: a
  404/not-supported primary → retry on the fallback, cached per session.
- imageSize capability audit: drop `'0.5K'` (player) and `'2K'` (background_far) from
  lite slots, or request only what the active model serves. The new fallback model
  honors sizes, so the audit also defines what the fallback path serves.
- Verification ($0 + minimal paid): no `2.5` model id remains in `src/`; forced-bogus
  primary model run exercises the fallback rung end to end.

### Phase 2 — Production Gemini verification (1 day, on granted access) — client priority 2

- New `scripts/gemini-preflight.mjs`: reads the key from `.env`, runs one text call and
  one image call per tier (`3.1-flash-lite-image`, `3.1-flash-image`, `3-pro-image`),
  prints `ProviderError.kind` / usage / latency / estimated cost per call. Never prints
  the key.
- New `window.__PM_GEMINI_CHECK()` in-app diagnostic: same checks against the browser's
  key (env or `localStorage 'GEMINI_API_KEY'`), plus last-error-kind visibility in
  ScreenZero's terminal already partially exists — surface the `kind` explicitly.
- Verify against production: key present in the Vercel build, billing enabled, quota
  headroom; confirm the real request path succeeds from `playmintai.vercel.app`.
- Ops checklist: add `SUPABASE_SERVICE_ROLE_KEY` to Vercel (Environment Variables →
  Production) so `/api/keepalive` stops reporting `configured:false`.
- Hypothesis to confirm: production may currently be degrading to static art because the
  2.5 fallback 404s on the key — Phase 1 alone may restore requests. The preflight
  proves which.

### Phase 3 — Matcher world tightening (1.5 days) — client priority 3

Files: `src/game/assetCache/matcher.js`, `src/game/assetCache/index.js`, `CLAUDE.md`.

- Deterministic post-validation of the LLM verdict in `tryMatchedReuse`, before
  acceptance:
  - both prompts have a known theme (`parsePromptKeywords` / `config.themeKey` /
    `candidateTheme`) and they differ → reject, annotate
    `matchRejected: 'world-theme-mismatch'`;
  - custom-world prompt (no theme) → require a deterministic overlap floor
    (shared world nouns / tags between prompt and candidate `sourcePrompt` + `tags`)
    before accepting whole-set or partial reuse;
  - keep the existing ≥2 `WORLD_SLOTS` and `MAX_REDRAW_WEIGHT` rejections.
- Matcher prompt/schema: state the new request's parsed theme explicitly in
  `buildMatchPrompt`; keep the replaceSlots semantics and the redraw-economics clause.
- `localMatch` stays as-is (already conservative: exact theme + named-entity equality).
- Tests: a $0 harness over synthetic candidate sets (theme mismatches, custom worlds,
  entity clashes) + 1–2 paid matcher calls for sanity.
- Telemetry: new `matchRejected` reasons so the benchmark separates "no candidate fit"
  from "fit rejected by the new gate".

### Phase 4 — Reset stats + clean benchmark (1 day)

- Reset `PM_TIMING_LOG`, `PM_SPEND_TOTAL`, `PM_CACHE_STATS` (fresh profile or explicit
  resets) before the sample so numbers reflect only post-fix behavior.
- Run the ~10-prompt sample (runner / platformer / shooter; at least one prompt per
  static theme keyword and one custom world) through the real pipeline in normal mode,
  plus one exact cache hit and one share-link restore.
- Sheet A/B: 2–3 generation runs with `PM_MODEL_SHEET='gemini-nano-banana-2.1'`
  (~$0.10 each) to compare sheet-gate pass rate and visual consistency against
  `gemini-3.1-flash-image`.
- Deliverable: benchmark report — cost/run, generation latency per scenario
  (fresh / cache-assisted / exact / restored), cache hit rate, failure taxonomy,
  matcher precision (with the new rejections annotated), and the sheet-model verdict.
- Budget: ~$3–4 sample + ~$0.25 A/B + matcher sanity calls.

### Phase 5 — Public / Publish / Share (2–3 days, gated on benchmark sign-off)

- Design + first slice: `visibility` on saved games (`private | unlisted | public`),
  a public `/g/:id` page built on the existing share-link restore path, and a publish
  toggle in My Games.
- Prerequisites flagged: two-account RLS isolation log still pending; `/api/keepalive`
  fix from Phase 2.
- May spill into November; the full slice ships only after the benchmark is reviewed.

---

## 4. Sequencing & timeline

```
Phase 0 ─▶ Phase 1 ─▶ Phase 3 ─▶ Phase 2 (prod, on access) ─▶ Phase 4 ─▶ Phase 5
                                  ▲ granted access ─────────────┘
```

- One commit per phase, conventional messages, `CLAUDE.md` updated in the same commits.
- The duplicate-player fix (if Phase 0 confirms the sheet-layout hypothesis) is inserted
  as its own commit after Phase 1, with a `.replay()`-verified before/after at $0.
- Prod access (Vercel invite + Google AI Studio / Cloud console) is the only external
  dependency; Phase 2 can run in parallel with Phase 3 once granted.

## 5. Budget summary

| Item | Estimate |
|---|---|
| Phase 1 verification | ~$0.10 |
| Phase 2 preflight (all tiers) | ~$0.15 |
| Phase 3 matcher sanity | ~$0.05 |
| Phase 4 sample (10 runs + cache + share) | ~$3–4 |
| Phase 4 sheet A/B (2–3 runs) | ~$0.30 |
| **Total** | **≈ $4–5** |

## 6. Risks

- **Prod access delay** → Phase 2 slips; everything else is unblocked.
- **Fallback model also unavailable on the key** → runs degrade to static art by design;
  the preflight will tell us immediately.
- **Duplicate-player root cause elsewhere** → capture first; if it's generation-side
  (two characters drawn in one cell) the fix moves to the sheet prompts/gates, not the
  layout scorer.
- **Benchmark reveals regressions** → fixes take priority over Phase 5 start.
