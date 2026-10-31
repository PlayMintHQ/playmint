# Task Context: Client Feedback Round (6 points)

Session ID: 2026-09-22-client-feedback-round
Created: 2026-09-22
Status: in_progress

## Current Request

Client feedback checkpoint round. Fix 6 issues:
1. Selected game mode ignored when a prompt is typed (mode must always win over prompt-derived mode).
2. Theme fidelity inconsistent ("Jungle world" → non-jungle visuals in all cache modes). Root cause: config lacks themeKey → static fallback boots 'ice'.
3. Shooter Arena mobile fire button only fires when enemy in range. Fix: cone aim-assist (nearest enemy in range AND within ~±45° of facing), else straight shot along facing.
4. Production `public.profiles` missing — ops task: apply migration SQL to production (no repo change).
5. games.sql: column-gated INSERT grant (exclude id/owner_id/timestamps/visibility/published_at/allow_remix/remix_parent_id); `enforce_games_row_cap()` → SECURITY INVOKER. Keep UPDATE grants unchanged.
6. Google OAuth branding — client-owned checklist (no code). Launch blockers (Gemini proxy, upload auth) documented as follow-ups.

## Context Files (Standards to Follow)

- CLAUDE.md (repo root — the project's standards doc; verified against code 2026-08-25)
- No .opencode/context/ files exist in this repo.

## Reference Files (Source Material to Look At)

- src/game/geminiService.js — generateGameConfig(promptText, onProgress); mode map at :27-29; config build at :145-171
- src/components/ScreenZero.jsx — selectedMode state (:135); generateGameConfig call sites (:504 overlay, :561 main); toStaticThemeConfig (:335-341)
- src/game/modes/ShooterMode.js — update() fire branch (:214-225); findNearestEnemyInRange (:239+)
- supabase/drafts/games.sql — grants (:72); enforce_games_row_cap (:97-110)
- src/game/promptUtils.js — parsePromptKeywords (mode/theme detection)
- src/game/assetPipeline/promptDesigner.js — localDesign THEME_ACCENTS[themeKey]
- src/game/assetCache/matcher.js — candidateTheme

## External Docs Fetched

None needed (no external libraries involved).

## Components

1. geminiService.js: options param + themeKey stamping
2. ScreenZero.jsx: pass selectedMode at both call sites
3. ShooterMode.js: cone aim-assist firing
4. games.sql: column-gated INSERT + SECURITY INVOKER
5. Ops: apply profiles migration to production (documented, not executed here)
6. Follow-up writeup: Gemini proxy + upload auth (documented)

## Constraints

- `npm run build` and `npm run lint` are the only checks (no test suite).
- Lint baseline ~46 errors in src/ — don't add to it.
- Mode selection must ALWAYS win over prompt-derived mode (client direction).
- Theme parsing stays prompt-driven (mode-agnostic).
- Keep UPDATE grants on games unchanged (client decision).
- Shooter: cone aim-assist, else straight shot (client decision).
- Launch blockers documented as follow-ups (client decision).
- Do not commit .env or paste key values.

## Exit Criteria

- [x] generateGameConfig accepts { mode } option; resolvedMode used for gameType/title/layout
- [x] ScreenZero passes selectedMode at both prompt call sites
- [x] Config from generateGameConfig carries themeKey/secondaryThemeKey
- [x] ShooterMode touch branch: cone-filtered aim-assist, else fireInDirection
- [x] games.sql: column-scoped INSERT grant; SECURITY INVOKER on row cap
- [x] npm run build passes; lint adds no new errors (46 baseline unchanged)
- [x] Follow-up writeup for Gemini proxy + upload auth documented

## Follow-up designs (documented, NOT this round)

### A. Server-side Gemini proxy (`/api/gemini`)
Problem: `VITE_GEMINI_API_KEY` is compiled into the client bundle (`.env.example`), so anyone can extract it and burn the account's quota/bill.
Design: a Vercel serverless function holds `GEMINI_API_KEY` server-side. The browser sends only the prompt + design JSON; the server relays image/JSON/vision calls to the Gemini API and streams results back. Client code swaps `providers/geminiImage.js`'s direct `@google/genai` calls for fetch calls to `/api/gemini`. Gate behind Supabase auth once accounts are required (November quota work). Cost telemetry (`assetMeta.cost`) must keep working — the proxy should return usageMetadata.
Notes: `api/games/upload.js` is the existing serverless precedent. Plain `npm run dev` has no `/api` — the proxy must no-op to the current client-side path in dev (like the Blob base URL self-config).

### B. Authenticated Blob upload endpoint (`api/games/upload.js`)
Problem: the upload-token endpoint is public by design (PNG/JSON only, ≤4MB, path allowlist `games/<gameId>/<slot>.png|meta.json`). Anyone can write arbitrary blobs within that shape.
Design: require a Supabase Bearer JWT (`Authorization: Bearer <access_token>`) via `isAuthenticated`; verify the caller's `uid` owns the `gameId` being written (or at minimum that the session is valid). Keep the existing guardrails. This pairs with Week 2 (saved games) — the client already has accounts, so the JWT is available at every write site.
Notes: `games.sql` header flags the related October issue — published art must be immutable (copy-on-publish) before games go public.