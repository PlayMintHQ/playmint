# Character Animation — Quality Overhaul Plan (v2)

Researched 2026-08-04 against the live Gemini API docs, current pricing, and third-party
sprite-generation field reports. Builds on the continuity overhaul already shipped in
`38b1508` (per-frame alignment, per-cell re-key, culling, per-frame escalation, free 2×2).

---

## 1. What the SDK/API research found (restrictions + opportunities)

### Models — we are on the legacy tier

| Model | Status | Price (1K image) | Notes |
|---|---|---|---|
| `gemini-2.5-flash-image` | **what we use today** — "legacy, no longer recommended" | $0.039 | 1K only, weakest identity consistency |
| `gemini-3.1-flash-lite-image` | current, cheapest | $0.0336 | 1K only — *cheaper than what we use now* |
| `gemini-3.1-flash-image` | current workhorse | $0.067 (2K: $0.101, 4K: $0.151) | up to **4 dedicated character-reference images** + 3 style refs; much better character consistency |
| `gemini-3-pro-image` (Nano Banana Pro) | premium | $0.134 (4K: $0.24) | best-in-class consistency ("up to 5 people across images"); marketed explicitly for sprite/character sheets |

### Hard restrictions confirmed

- **No alpha channel, ever.** Flat RGB regardless of prompt. Our keying pipeline stays load-bearing.
- **No free tier on ANY image model** via API (free tier went to 0 images/min Dec 2025). Billing key required — the client's key has billing since 2026-07-20, so fine.
- **Multiple images in one response** (interleaved output) exists on Gemini 3 models but the model "will not always follow an exact requested number of image outputs" — cannot be the primary strategy, only an opportunistic bonus.
- **Reference images**: up to 14 per request on 3.1-flash (10 object + 4 character + 3 style). We currently send exactly 1. This is the biggest untapped lever.
- `imageConfig.imageSize`: `'1K' | '2K' | '4K'` (uppercase K required). **Already typed in our installed SDK** (`@google/genai` 2.12.0; latest is 2.15.0 — minor bump, zero-risk).
- SynthID watermark on all output (invisible; irrelevant for sprites).
- Grid sheets are **not uniformly spaced** by the model — content-aware slicing beats uniform division (field report). We slice uniformly with a 3px inset today.

### Field-report lessons (sprite-specific, roboticape.com)

- **White backgrounds are the wrong chroma key.** Pure green `#00FF00` + a 2–3px white outline works better: green has zero overlap with sprite palettes (white doesn't — that's why we needed flood keying), and the white outline is a buffer zone where anti-aliasing blends harmlessly instead of baking backdrop color into edge pixels.
- Keep sheets small (2–3 rows max), one character per sheet — matches our 3×3.
- ALL-CAPS non-negotiables in prompts ("CRITICAL BACKGROUND REQUIREMENT…") measurably improve compliance.

---

## 2. The plan — four phases, cheapest wins first

### Phase 1 — Model upgrade (biggest quality lever, ~1 day)

1. Bump `@google/genai` 2.12.0 → 2.15.0.
2. Split `GEMINI_IMAGE_MODEL` in `slotSpecs.js` into per-purpose constants:
   - `GEMINI_SLOT_MODEL = 'gemini-3.1-flash-lite-image'` (static slots — cheaper AND newer than today)
   - `GEMINI_SHEET_MODEL = 'gemini-3.1-flash-image'` (sheet + per-frame escalation — the consistency workhorse)
   - optional premium rung: `gemini-3-pro-image` for ONE retry when the 3.1 sheet fails gates (replaces or precedes per-frame escalation; $0.134 vs up to $0.67 for 10 escalation calls — *cheaper and likely better*).
3. **Model fallback ladder** in `geminiImage.js`: a 404/permission error on a 3.x model transparently retries on `gemini-2.5-flash-image` (protects keys/regions without 3.x access). Log which model actually served.
4. Generate the sheet at **2K** (`imageSize: '2K'`) and downscale cells 2× — supersampling gives cleaner edges after keying for +$0.03/sheet.

Cost per game (sheet path): today ~$0.08 → ~$0.17. Worst-case with pro-retry: ~$0.30 (vs $0.47 today's worst case with 10 escalation calls).

### Phase 2 — Frame cleanliness (deterministic, no new API cost)

1. **Green-screen variant** (`post.chromaKey: 'green'` spec flag on player/enemy/sheet): scaffold asks for flat `#00FF00` background + thin white outline, ALL-CAPS constraint block. Keying: existing flood keyer already seeds from the dominant border color, so green Just Works; add an HSV **despill pass** (edge pixels with green-shifted hue → desaturate toward neighbor color) to kill the last AA fringe. A/B-gated so we can compare against white before committing.
2. **Content-aware cell slicing** in `processSheet`: project non-background pixel counts per column/row, find the background gutters, slice at true boundaries; fall back to the uniform grid when gutters aren't found. Fixes the "model drew a slightly off-grid sheet" failure class that currently clips limbs.
3. **Per-frame edge-cleanliness score**: residue fraction along each cell's alpha edge; a single dirty frame gets its own re-key instead of dragging the sheet toward rejection.

### Phase 3 — Visual double-check upgrade (the QA ask)

1. **Filmstrip QA** (new `qa.js` review kind `'strip'`): after align+cull, composite surviving frames side by side with painted frame numbers, ONE vision call returning per-frame verdicts: `{ sameCharacter: bool[], badFrames: int[], baselineStable, strideLooksContinuous }`. Union `badFrames` into the cull decision — vision catches "same colors, wrong character/pose" that the histogram L1 can't.
2. **Silhouette-IoU drift metric** (deterministic, free, runs first): IoU of consecutive aligned frame masks. Adjacent run frames should land in a band (~0.55–0.95): below = identity/pose jump, above = duplicate frame (replaces/strengthens `framesLookStatic`). Cheap early signal that also throttles how often the vision call is even needed.
3. **Closed-loop single-frame repair**: when metrics/QA flag exactly 1–2 bad frames and dropping them would fall below 4 survivors, regenerate JUST those frames (image-edit of the static reference with the pose text, ≤2 calls) instead of rejecting the whole sheet. Today we can only drop or reject.
4. **Post-finalize QA**: today vision reviews the pre-cull preview; add the final assembled strip as the reviewed artifact so what's checked is what ships.

### Phase 4 — Playback polish (zero API)

1. **Centroid alignment**: switch `alignFrames` horizontal anchor from bbox center-x to alpha-weighted centroid-x (clamped ±8px from bbox center) — bbox center wobbles when an arm extends; centroid tracks the torso.
2. **Palette lock**: quantize all frames to a shared palette sampled from the static reference (~32 colors, nearest-match) — kills per-frame color flicker entirely and reads as intentional pixel-art.
3. Multi-reference escalation: per-frame escalation calls attach the static ref **plus the previously accepted frame** (2 refs — well within the 4-character-ref budget) so consecutive frames cohere.

---

## 3. Verification

- `npm run build` clean, `npm run lint` ≤ baseline (~47).
- Free path untouched (sana can't use refs/models) — regression-check only.
- Gemini spend paths tested by the user (standing rule). Suggested checks:
  - `assetMeta.slots.player` gains `model` field — confirm `gemini-3.1-flash-image` served.
  - Compare one identical prompt before/after (seeded) for identity drift and edge halos.
  - Force gate failure once → confirm pro-retry (or repair loop) fires and logs.
- Each phase ships independently; green-screen and pro-retry sit behind flags for A/B.

## 4. Risks

- 3.x model availability varies by key/region → the fallback ladder is mandatory, not optional.
- Green-screen: model may leak green into the sprite (banned explicitly in prompt; despill pass mops up) — hence the A/B flag.
- 2K sheets double payload size through the pipeline — postprocess is canvas-based and fine, but keep the 45s timeout generous (bump to 60s for 2K).
- Multiple-images-per-response stays OUT of the plan (confirmed unreliable count compliance).
