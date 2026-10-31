# PlayMint — October 2026 Milestone Agreement
## Section 2C: Server-Side Protection, API Modernization & Public Sharing Architecture

**Effective Date:** October 19, 2026  
**Final Delivery Date:** October 31, 2026  
**Project:** PlayMint Procedural 2D Game Engine & Community Platform  
**Preceding Addenda:** Section 2A (Auth & User Profiles), Section 2B (Cloud Save & RLS Architecture)

---

### 1. Context & Purpose
This Agreement Addendum formalizes **Section 2C** of the PlayMint engineering contract, establishing the specifications, deliverables, and security requirements for the October 2026 milestone.

Section 2C bridges the private-beta authenticated game creation platform established in September (Sections 2A & 2B) with the production-grade public discovery and sharing platform. It resolves critical server-side AI quota protection, modernizes Gemini model integrations, enforces persistent rate limits, and delivers the full **Public / Publish / Share** architecture for the October 31 delivery.

---

### 2. Detailed Technical Scope & Deliverables

#### Part 1: Server-Side Protection & Quota Enforcement Architecture
1. **Centralized Serverless AI Gateway (`/api/generate`):**
   - All external generation calls to Google Gemini (`@google/genai`) are routed exclusively through the server-side API endpoint.
   - Client applications never receive, bundle, or compile `GEMINI_API_KEY` into browser artifacts.
   - Supports image generation (`gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, `gemini-nano-banana-2.1`) and structured text/vision generation (`gemini-flash-latest`), including character reference sheets, multi-layer parallax backgrounds, and vision QA.

2. **Persistent, Database-Backed Rate Limiting:**
   - Replaces transient in-memory counters with persistent, atomic storage in PostgreSQL (`public.generation_usage`).
   - Concurrency-safe atomic check-and-increment stored procedure (`check_and_increment_rate_limit`) utilizing `FOR UPDATE` row-level locks, ensuring strict quota enforcement across stateless serverless lambdas, cold starts, and container recycling.
   - **Enforced Quota Tiers (24-Hour Sliding Window):**
     - **Anonymous Guests (Keyed by IP):** Maximum **25 API calls / 24h** (sufficient for 2–3 full games).
     - **Authenticated Users (Keyed by User UUID):** Maximum **200 API calls / 24h** (sufficient for 20+ full games).
   - Standard HTTP response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
   - Exceeded quotas return HTTP 429 (`kind: 'quota'`) with clear client upgrade messaging, triggering graceful client-side fallback to built-in static theme artwork without engine failure.

3. **Complete Elimination of Client-Side Key Fallback in Production:**
   - In production builds (`import.meta.env.PROD` and live domains), client-side Gemini SDK instantiation is strictly blocked.
   - `getGeminiKey()` evaluates to an empty string in production, ensuring neither `.env` nor browser `localStorage` can be exploited to bypass server-side rate limits.
   - Manual API key entry forms, prompt alerts, and configuration toggles are conditionally compiled out of production UI components (`ScreenZero`, `CreatorPanel`).
   - If `/api/generate` is unreachable or exceeds quota in production, requests fail fast with structured `ProviderError` exceptions and downgrade safely to built-in theme assets, with zero fallback to direct client-side Gemini calls.

---

#### Part 2: Gemini API Deprecation Migration & Benchmark Checkpoint
1. **Model Modernization:**
   - Replaced deprecated fallback model `gemini-2.5-flash-image` with GA-standard `gemini-3.1-flash-image`.
   - Updated model price tables, capability bounds, and fallback ladders across the pipeline.
   - Audited slot specifications to eliminate silent 400 errors (removed unsupported `0.5K`/`2K` dimensions on lite models).

2. **API Parameter Alignment (`thinkingConfig`):**
   - Resolved Google Gemini API mutual exclusivity constraints by replacing conflicting `{ thinkingBudget: 0, thinkingLevel: 'MINIMAL' }` configurations with `{ thinkingBudget: 0 }`.
   - Eliminates HTTP 400 `INVALID_ARGUMENT` rejections across image generation, art direction, and vision QA endpoints.

3. **Deterministic Matcher Semantic Tightening:**
   - Implemented strict pre-validation in `tryMatchedReuse` before accepting LLM candidate recommendations:
     - Deterministic rejection of conflicting static themes (`world-theme-mismatch`).
     - Required semantic token overlap floor for custom procedural worlds (`custom-world-low-overlap`).
     - Prevention of multi-world-slot redraw conflicts (`world-clash`).

4. **Multi-Scenario Benchmark Validation:**
   - Executed clean 10-run headless benchmark suite verifying the 4-tier cache economics:
     - **Exact Cache Hit:** 0.05s – 0.18s latency | $0.0000 cost (100% savings).
     - **Matched Reuse:** 1.93s – 2.45s latency | ~$0.0003 cost (99.9% savings).
     - **Partial Redraw:** 16.85s latency | ~$0.0450 cost (88% savings).
     - **Fresh Generation:** 14.46s – 57.11s latency | $0.275 – $0.441 cost.
   - Confirmed sheet model A/B comparison (`gemini-3.1-flash-image` vs `gemini-nano-banana-2.1`), validating `gemini-3.1-flash-image` as the superior balance of sprite cut precision and output token efficiency.

---

#### Part 3: Public / Publish / Share Architecture (October 31 Target Scope)
1. **Database Schema & RLS Policy Expansion:**
   - Add `visibility text not null default 'private'` to `public.games` table, constrained to `'private' | 'unlisted' | 'public'`.
   - Update Supabase Row Level Security (RLS) policies:
     - `SELECT` on `public.games` permitted if `auth.uid() = user_id` OR `visibility IN ('unlisted', 'public')`.
     - `INSERT`, `UPDATE`, `DELETE` strictly restricted to `auth.uid() = user_id`.
     - Maintain existing 200-game per-account quota cap and column-level update grants.

2. **Public Game Viewer (`/g/:id`):**
   - Lightweight public route allowing anyone to play published or unlisted games via direct link.
   - Clean HUD with creator attribution ("Created by [Username]"), Game Name, Mode, High Score, and "Remix / Create Your Own" call to action.
   - Built on top of the cross-device share restoration engine (`shareLink.js`), rehydrating procedural configurations without redundant AI generation calls.

3. **Creator Dashboard Publishing Controls:**
   - Publish toggle within the "My Games" management grid:
     - **Private:** Visible only to the game creator.
     - **Unlisted:** Playable by anyone with the direct `/g/:id` link; hidden from discovery feeds.
     - **Public:** Fully published and indexed for future community feeds.
   - Instant "Copy Link" action with toast confirmation.
   - Retains existing card thumbnails, rename, and confirmation-gated delete actions.

4. **Asset Immutability & Snapshot Integrity:**
   - Ensures games published with AI assets retain permanent access to their generated sprites, character sheets, and backgrounds even as local cache populations rotate.

---

### 3. Milestones & Delivery Schedule

| Milestone / Deliverable | Status | Target Date |
|---|---|:---:|
| **Checkpoint 1:** Benchmark Report & Gemini API Verification | **Completed & Approved** | Oct 26, 2026 |
| **Checkpoint 2:** Persistent Server Limits & Zero Client Key Fallback | **Completed & Tested** | Oct 26, 2026 |
| **Checkpoint 3:** Final Section 2C Delivery (Public/Publish/Share, `/g/:id`, RLS, Minimal Remix) | **Completed & Tested** | **Oct 31, 2026** |

---

### 4. Acceptance Criteria for Section 2C Final Sign-Off
1. **Security:** Zero client-side API keys in production builds. Serverless rate-limiting reliably persists across lambda recycles.
2. **Quality & Performance:** Clean Vite production build (`npm run build`), no new linter regressions, and existing test suites pass.
3. **User Experience:** Seamless transition between private game saving and public URL sharing via `/g/:id` with zero broken assets.

---

**Signed and Agreed:**

**Client:** ___________________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **Date:** ___________________  
**Bogdan (Lead Engineer):** ___________________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **Date:** ___________________
