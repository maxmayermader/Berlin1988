# Project Research Summary

**Project:** Berlin 1988 — Cold War hidden-movement board game
**Domain:** Realtime multiplayer web game (UI, realtime sync, bot integration)
**Researched:** 2026-08-18
**Confidence:** MEDIUM-HIGH overall

## Executive Summary

Berlin 1988 is a well-scoped realtime multiplayer hidden-movement game with an **already-complete, battle-tested rules engine and AI system** (`packages/shared`, `packages/engine`, `packages/ai` — 69 passing tests). This milestone's job is to add a Next.js/PartyKit UI and realtime networking layer on top of that solid foundation. The recommended approach is a **phase-gated single-room architecture** (one Durable Object per match with internal state machine: LOBBY → LOADOUT → IN_GAME → ENDED) plus a **singleton directory room for public lobby browsing** — this avoids the state-migration bugs that plague multi-room handoff patterns and keeps the engine pure (lobby bookkeeping never touches `@berlin/engine` or `@berlin/ai`).

The tech stack is straightforward: **Next.js 15, React 19, PartyKit, Zustand, Tailwind v4, and Zod** are all actively maintained and confirmed compatible. The main risks are **not technical but architectural**: fog-of-war leakage at the wire (broadcasting full state instead of per-connection projections), silent submission failures (optimistic UI without server ack), and PartyKit-specific gotchas (hibernation dropping listeners, reconnection returning stale state). **Lobby state races** (join-code collisions, concurrent kick/ready/resize) and **bot timing** (AI submissions revealing bot identity by being instant) are also high-stakes but well-understood from the research. All of these are preventable with explicit design decisions made upfront, not retrofit.

Research strongly recommends a **build order that sequences lower-risk work (lobby, deckbuilder) before higher-risk work (simultaneous order submission and resolution)**. This de-risks the multiplayer/realtime phase by proving the PartyKit room lifecycle and wire protocol on simpler, engine-independent features first, then tackling the timing-critical resolution logic once those foundations are solid. The 14-round match loop is the critical path; everything else is supporting infrastructure.

## Key Findings

### Recommended Stack

**Next.js 15.5.23** (not 16, which is now the npm `latest` tag but would introduce breaking changes mid-milestone), **React 19.2.x**, and **PartyKit 0.0.115** form the core. PartyKit remains actively maintained under Cloudflare (post-April-2024 acquisition) with releases through March 2026 and open issues through July 2026 — this research confirms the existing architecture doc's bet on PartyKit is sound. Client-side state management via **Zustand 5.0.15** (thin, no-reducer ceremony, pairs cleanly with PartyKit's broadcast model) and wire-protocol validation via **Zod ^4** (current stable major, not legacy v3). UI primitives via **shadcn/ui CLI** (copy-in components, not a dependency — critical for the retro CRT aesthetic requiring deep restyling). Styling with **Tailwind v4** (CSS-variable-based `@theme` model handles the two-theme requirement: phosphor-green and high-contrast). Animation via **Motion 13.x** (the new package name for framer-motion; includes `useReducedMotion` hook for the project's accessibility rule).

**For persistence, localStorage via Zustand's `persist` middleware is the right choice for v1** (player name + a handful of 10-card loadouts = well under 5MB ceiling); defer IndexedDB to v2+ only when data outgrows it. **`partysocket` 1.3.0 is the correct WebSocket client library** — purpose-built for PartyKit, dependency-free, includes reconnect-with-backoff and a React hook. Do NOT build a second reconnection layer in `apps/web/lib/socket.ts`.

**Key stack decisions:** Avoid Next.js 16 (architecture change mid-milestone), `reactflow` (unmaintained), Yjs/CRDT (solves concurrent writes this architecture prevents by design), third-party chat SDK (PartyKit room is the hub), and IndexedDB for v1 (adds async-loading for kilobytes of data).

### Expected Features

**Table stakes** (must have): join code, shareable link, public lobby browser, ready-up with per-seat visibility, host kick, AI auto-fill, in-lobby/in-match chat, deck persistence, real-time deckbuilder legality feedback, starter presets, round timer (60s default), "orders submitted" locking indicator (without content), atomic round resolution report, Burn Track panel, node-graph board, and result screen.

**Competitive differentiators** (should have): budget/constraint visualizer (BP meter, icon pips), archetype-aware hints, post-round "what you learned" digest (deduction aid), AI personality display, consistent retro CRT theming end-to-end.

**Explicit anti-features** (don't build): live animated simultaneous movement, global matchmaking, unmoderated free-text chat alone, server-side deck sync, mobile-optimized UI, voice chat, custom rule presets.

### Architecture Approach

A **single Durable Object per match** with an internal `phase` state machine (LOBBY → LOADOUT → IN_GAME → ENDED) keeps everything in one coherent lifecycle, avoiding state-migration bugs. **Lobby state** (seats, ready flags, join code) lives in `RoomState`; **`GameState`** (authoritative game rules) is created only at LOADOUT → IN_GAME transition. A **singleton directory room** (`party=lobbies, id="index"`) acts as an in-memory index of open matches. The **engine is imported as a two-runtime library**: browser uses it for prediction (affordances), room uses it for authority (validation/resolution). **Engine never sees lobby state** — this separation is enforced by an import-boundary rule.

**Major components:** (1) **Match Room** — Durable Object, owns state, routes messages through phase-gated handlers, broadcasts per-connection `PlayerView` (never bulk `broadcast()` of full state). (2) **Lobbies Directory** — singleton in-memory index. (3) **apps/web client** — holds only `PlayerView`, engine used for prediction only.

### Critical Pitfalls

**1. Fog-of-war leaks at the wire.** `PlayerView` type-safe ≠ wire-safe. `room.broadcast(message)` sends one payload to all connections, trusting clients not to render hidden fields — but devtools sees everything. **Prevention:** Loop connections and call `projectView(state, connectionPlayerId)` per recipient. Re-derive replay per viewer. Strip debug endpoints.

**2. "Waiting for other players" reads as a hang.** No progress signal during order-composing = player thinks app is broken. **Prevention:** Show live count ("2 of 4 committed") and visible timer, both safe to broadcast. Separate composing/waiting/resolving phases visually. Surface timer prominently.

**3. Silent submission failure.** Optimistic "locked in" UI without server ack. Connection drops or validation fails, player discovers only via auto-Hold. **Prevention:** "Locked in" state driven by explicit server ack. Model: `submitting → confirmed` or `submitting → rejected(reason)`. On reject, return to composing with error. Reconcile on reconnect.

**4. PartyKit hibernation drops onConnect listeners.** Cloudflare Durable Objects can sleep; listeners attached in `onConnect` are lost on wake. **Prevention:** Use `onMessage()` / `onClose()` only for per-connection logic. Persist state via PartyKit storage (GameState itself is perfect for this).

**5. Reconnection returns stale/wrong-identity.** Either cached old view or connection.id used as identity (looks like new player). **Prevention:** Generate stable session token at lobby join, store client-side, require on reconnect. Recompute fresh `projectView()` on every reconnect, send as first message.

**6. Lobby race conditions.** Join-code collisions, kick during ready-toggle, resize mid-ready-up. **Prevention:** One authoritative RoomState; every message is pure state transition applied in arrival order. Generate-claim-retry for codes. Recompute ready-threshold after every event. Assign bots only at match-start.

## Implications for Roadmap

### Suggested Phase Structure (9 phases)

**Phase 1: Match Room Skeleton & Phase State Machine**
- Foundational: `RoomState` type, phase machine, `MatchRoom.ts` with `onMessage`/`onClose` scaffold
- Establishes hibernation-safe pattern upfront

**Phase 2: Lobby Handlers & Join Code Generation**
- Lower-risk, engine-independent; proves wire protocol early
- join code, kick, ready-up, countdown (generate → claim → retry)
- "N of M ready" broadcast (safe, count-only)
- Good candidate for early delivery and multi-tab testing

**Phase 3: Lobbies Directory Room & Public Lobby Browser**
- Singleton directory, match rooms announce themselves
- Home-page subscription to live list
- Can be parallel with Phase 2

**Phase 4: Deckbuilder Component & Loadout Submission**
- Shared component (home page + in-lobby)
- Reuses engine's loadout validator
- Table-stakes feature, well-scoped

**Phase 5: Match Start & First Round Setup**
- HIGHEST RISK: GameState created, engine enters critical path
- Per-connection projection boundary established here
- **Research flag:** untested 4-player timing. Spike: run 4-bot sim in live PartyKit room, measure message queue depth and latency from first to last player's submission

**Phase 6: Secret Order Assignment & Submission**
- Core turn loop: board UI, order composer, legality checks, submission ack
- **Research flag:** wire-level fog-of-war. Add integration test capturing literal WebSocket bytes, assert no opponent hidden data leaks

**Phase 7: Round Resolution & Replay Animation**
- Deadline via `onAlarm`, auto-Hold, `resolveRound()` call
- Step-through replay (not live animation), per-viewer-filtered history
- **Research flag:** multi-player animation timing at 4 concurrent agents

**Phase 8: Reconnection & Grace-Period Handling**
- Stable session tokens, fresh `projectView()` on reconnect
- Grace-period policy visible ("reconnecting... Ns left")
- Explicit project success criterion: four browsers complete match with one disconnect/rejoin mid-round

**Phase 9: AI Auto-Fill & Solo Mode**
- Bots through same submission path as humans
- Padded think-time: compute immediately, delay N-sec before submitting
- Randomized delay, difficulty-scaled
- Prevents instant-submit reveals bot identity

### Phase Ordering Rationale

Phases 2–3 before 5 to prove room lifecycle/wire protocol on simpler features. Phase 5 before 6 (need GameState to validate orders). Phase 6 before 7 (collect before resolve). Phase 7 before 8 (need working match to reconnect into). Phase 8 before 9 (bots must use same paths as humans).

### Research Flags

**Phases needing deeper research:**
- **Phase 5:** Concurrent 4-player timing (message ordering, queue depth, latency). Local sim required before shipping.
- **Phase 6:** Wire-level fog-of-war correctness. Integration test needed; devtools inspection required.
- **Phase 7:** Multi-player resolution animation timing (8–16 events, 4 concurrent agents). Profile before shipping.

**Standard patterns (skip research-phase):**
- Phases 1–3 (room patterns well-documented)
- Phase 4 (deckbuilding fully specified)
- Phases 8–9 (established patterns, no novel risks)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry; PartyKit maintenance confirmed; compatibility cross-checked |
| Features | MEDIUM | Table-stakes grounded in genre consensus; competitive analysis LOW-confidence; design doc validates approach |
| Architecture | MEDIUM-HIGH | Project's existing `docs/ARCHITECTURE.md` is detailed and tested; research adds lobby/match split validated against PartyKit practice |
| Pitfalls | MEDIUM | Patterns established across realtime multiplayer games; project-specific severity inferred from CONCERNS.md, not live incident data |

**Overall:** MEDIUM-HIGH

### Gaps to Address

1. **Untested real-time timing at n=4.** CONCERNS.md flags this; it's the critical unknown. Recommendation: Phase 5 planning should include explicit spike with 4-bot live-room measurement.

2. **PartyKit hibernation in production.** Local dev never triggers hibernation. Recommendation: deployed test of idle-then-message behavior before Phase 5 → production.

3. **Fog-of-war at resolution animation.** Easy to miss in 1-tab dev. Recommendation: Phase 7 QA must include manual multi-tab devtools inspection as explicit step.

4. **Bot believability.** Padded delays are correct approach, but "believable" is subjective. Phase 9 should include human playtest feedback to tune delay ranges.

## Sources

**HIGH confidence:** `docs/ARCHITECTURE.md` (code-verified, 69 tests), npm registry, PartyKit official docs, `.planning/codebase/CONCERNS.md`

**MEDIUM confidence:** PartyKit GitHub, Cloudflare acquisition blog, webDiplomacy/BGA/Jackbox patterns, boardgame.io real bug (#399)

**LOW-MEDIUM confidence:** Web search synthesis, Thoughtbot blog (join-code patterns), WebSocket.org guides
