# Phase 1: Playable Skeleton - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The thinnest possible end-to-end game: home page → create or join a lobby by code → ready up → a full 14-round match against AI or other humans → a result screen. One default loadout, one map, minimal styling, no deckbuilder, no public lobby browser, no chat, no round history/Burn Track, no transition polish. The goal is proving the round loop and simultaneous-resolution pipeline actually work end to end in a browser, not delivering a finished-feeling product.

Requirements covered: HOME-01, HOME-02, LOBBY-03, LOBBY-04, LOBBY-05, MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05, MATCH-08.

</domain>

<decisions>
## Implementation Decisions

### Default Loadout & Agent Count
- **D-01:** Every seat plays the **Phantom** starter preset loadout (no deckbuilder in Phase 1).
- **D-02:** Every player controls **1 agent**, not 2. — **Reversibility:** costly — the design doc and CONCERNS.md both recommend 2 agents for FFA/social modes to avoid early-elimination boredom (an eliminated player is benched with nothing to do for the rest of the match); the user explicitly chose 1 agent anyway for Phase 1 simplicity. A host-configurable agent-count toggle is not being built now — revisit if playtesting confirms the boredom problem, likely alongside the spectator-seat behavior from `docs/GAME_DESIGN.md`.

### Map & Round Timer
- **D-03:** Ship the smallest available map. Currently only one map is implemented — `duel12` (12 nodes, `packages/engine/src/content/maps/duel12.ts`), documented in-code as "the solo and 1v1 map." Whether `duel12` needs adaptation (or a new map) to host 3-4 players is left to research/planning, not decided here.
- **D-04:** Round timer is **90 seconds** (not the 60s default assumed elsewhere in the docs) — the user chose the more generous option CONCERNS.md itself floats as a fallback, given humans need to read the board and plan 2 actions per agent.

### Resolution Step-Through UX
- **D-05:** Step-through resolution report is **click-to-advance** — player clicks "Next" to reveal each event in fixed priority order. No auto-play/auto-advance timer.
- **D-06:** Each step's affected-agent move gets a **simple CSS slide/fade transition** to its new position/state, not an instant snap. Still strictly sequential — never reveals information ahead of its rules-defined step (per MATCH-05 / `docs/GAME_DESIGN.md` §7).

### AI Auto-Fill
- **D-07:** Empty seats (LOBBY-05) are filled with a **random personality** at a **single fixed mid-tier difficulty** (e.g. "Handler" tier) — not the lowest tier, not a difficulty picker. Chosen to sidestep the known Katja-in-duels 84% win-rate imbalance (`docs/AI_OPPONENTS.md` §7, CONCERNS.md) while keeping Phase 1 scope small (no difficulty UI).

### Hosting Architecture — Research Direction (not a locked decision)
- **D-08:** `docs/ARCHITECTURE.md` and root `CLAUDE.md` currently lock PartyKit as the authoritative match host. The user wants Phase 1 research to genuinely compare that against an **all-Vercel alternative** (Vercel + Upstash Redis for match state + WebSockets/SSE for live push) rather than only researching where PartyKit itself deploys. — **Reversibility:** one-way — whichever real-time architecture Phase 1 ships with is what every subsequent phase (lobby, chat, match) builds against; switching later means rewriting the room-server/transport layer. **The phase-researcher must produce a real comparison (not just a hosting-location lookup) and the planner must get an explicit decision from this comparison before implementation starts** — this is not pre-decided in favor of either option.
  - Note for research: "webhooks" (as the user mentioned) are server-to-server callbacks and cannot deliver live client-side push (round timer countdown, "N of M submitted" count) — the real alternative mechanism is WebSockets or SSE, not webhooks. Flag this correction to the researcher so the comparison targets the right mechanism.

### Player Identity
- **D-09:** No name text-entry step. The system **auto-generates a spy/handler codename** for each player (fits Cold War theming), and the player can **rename it before the match starts** (in lobby, pre-ready). Persisted via local storage, no login.

### Styling Baseline
- **D-10:** "Minimal styling" = **clean but plain** — basic Tailwind layout, readable typography/spacing, buttons that look like buttons. No theme, no animations beyond D-06's step transitions, no custom illustration. Full retro CRT/teletype theming is deferred (`THEME-01`, v2/Phase 4+).

### Refresh / Disconnect Behavior
- **D-11:** **No reconnection handling in Phase 1.** A page refresh or dropped connection loses the player's session — this is a known, accepted gap, not a bug to fix now. Drop resilience (LOBBY-06, AI takeover on disconnect) is explicitly Phase 3 scope.

### Claude's Discretion
- None — every gray area discussed reached an explicit user decision (including the researched-not-locked hosting comparison in D-08).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rules & Resolution
- `docs/GAME_DESIGN.md` §7 (and §7.2 specifically) — the fixed 11-step resolution priority order; step-through UX (D-05, D-06) must never reorder or reveal ahead of this sequence
- `docs/GAME_DESIGN.md` §12 — open design decisions, including the FFA agent-count recommendation referenced in D-02
- `packages/engine/src/resolution/index.ts` — the actual 11-step pipeline implementation the UI must mirror in its step-through report

### Architecture & Hosting
- `docs/ARCHITECTURE.md` §5 — protocol and current PartyKit room-server contract; must be read before the D-08 hosting comparison
- `.planning/ROADMAP.md` "Research Flags" section — lists all 5 Phase 1 research flags (4-player timing, wire-level fog of war, resolution step timing, PartyKit hibernation, hosting location) pulled forward from `.planning/research/SUMMARY.md`
- `.planning/codebase/CONCERNS.md` — "Simultaneous Turn Resolution Under Network Delay" and "PartyKit hibernation" sections directly inform the D-08 comparison

### AI Opponents
- `docs/AI_OPPONENTS.md` §4, §7 — personality/difficulty tiers and the documented Katja duel-dominance issue behind D-07's fixed mid-tier choice
- `packages/ai/src/personalities/index.ts` — actual personality weight vectors

### Fog of War
- `packages/shared/src/view.ts` — `PlayerView` type; MATCH-03/MATCH-04 depend on this never carrying opponent order content
- `packages/engine/tests/fog-leak.test.ts` — existing leak-scan test pattern; a wire-level equivalent is a Phase 1 research flag (per ROADMAP.md)

### Loadout Content
- `packages/engine/src/content/loadouts.ts` — where the Phantom preset (D-01) is defined
- `packages/engine/src/content/maps/duel12.ts` — the only implemented map (D-03)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/engine`, `packages/ai`, `packages/shared` are fully implemented and tested (69 tests green) — Phase 1 is UI/transport work only, no engine changes expected
- `packages/engine/src/content/maps/duel12.ts` — only map currently implemented, with x/y percentage coordinates already designed for SVG rendering ("x/y are percentages so the SVG board renders any map without code changes")
- `packages/engine/src/content/loadouts.ts` — Phantom and the other 3 starter presets already exist as data

### Established Patterns
- `apps/web`, `apps/party` are skeletons — only `CLAUDE.md` guidance files exist, no implementation code yet. This phase builds the real first slice of both.
- Fog-of-war enforcement is structural in `packages/shared/src/view.ts` (`PlayerView` has no field capable of holding opponent positions/safehouse/traps/cooldowns) — the UI layer must consume `PlayerView` only, never full `GameState`

### Integration Points
- `apps/party/src/` is where the room server, lobby state, round clock, and bot AI runner (calling into `packages/ai`) all need to be built
- `apps/web/app/` (Next.js App Router) is where home page, lobby, and match board UI need to be built, communicating with `apps/party` over whatever transport D-08's research selects

</code_context>

<specifics>
## Specific Ideas

- User is open to a non-PartyKit real-time architecture (Vercel + Redis + WebSockets/SSE) if research shows it holds up for simultaneous-turn resolution — see D-08. This is a genuine fork point, not settled.

</specifics>

<deferred>
## Deferred Ideas

- **Host-configurable agent count (1 vs 2)** — deferred past Phase 1 per D-02; revisit once playtesting confirms whether early elimination with 1 agent is actually a retention problem.
- **Spectator-seat behavior for eliminated players** — `docs/GAME_DESIGN.md`'s existing spectator concept is expected to absorb the "eliminated player has nothing to do" gap created by D-02's 1-agent choice; not explicitly scoped or re-decided in this phase.
- Reconnection/drop resilience — explicitly Phase 3 (LOBBY-06), noted in D-11.
- Full retro CRT/teletype theming — v2 (`THEME-01`), noted in D-10.

### Reviewed Todos (not folded)
None — no pending todos existed for this project yet.

</deferred>

---

*Phase: 1-Playable Skeleton*
*Context gathered: 2026-08-19*
