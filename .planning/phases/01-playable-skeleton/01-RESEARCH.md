# Phase 1: Playable Skeleton - Research

**Researched:** 2026-08-19
**Domain:** Realtime multiplayer web game — Next.js/PartyKit lobby, board, and simultaneous-turn UI on top of an already-complete rules engine
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Every seat plays the **Phantom** starter preset loadout (no deckbuilder in Phase 1).
- **D-02:** Every player controls **1 agent**, not 2. Reversibility: costly — revisit only if playtesting confirms early-elimination boredom is a real problem.
- **D-03:** Ship the smallest available map — `duel12` (12 nodes, `packages/engine/src/content/maps/duel12.ts`), documented in-code as "the solo and 1v1 map." Whether it needs adaptation for 3-4 players is left to planning.
- **D-04:** Round timer is **90 seconds** (not the 60s default assumed elsewhere in the docs).
- **D-05:** Step-through resolution report is **click-to-advance** — player clicks "Next" to reveal each event in fixed priority order. No auto-play/auto-advance timer.
- **D-06:** Each step's affected-agent move gets a **simple CSS slide/fade transition**, not an instant snap. Still strictly sequential — never reveals information ahead of its rules-defined step.
- **D-07:** Empty seats (LOBBY-05) are filled with a **random personality** at a **single fixed mid-tier difficulty** ("Handler" tier) — not the lowest tier, not a difficulty picker.
- **D-08 (RESEARCH DIRECTIVE, not pre-decided):** Genuinely compare PartyKit (currently locked in `docs/ARCHITECTURE.md`) against an all-Vercel alternative (Vercel + Upstash Redis + WebSockets/SSE) for the realtime hosting architecture. Reversibility: one-way — whichever architecture ships is what every subsequent phase builds against. **This research document's recommendation resolves D-08** — see the dedicated section below.
- **D-09:** No name text-entry step. The system **auto-generates a spy/handler codename** for each player; the player can rename it before the match starts (in lobby, pre-ready). Persisted via local storage, no login.
- **D-10:** "Minimal styling" = clean but plain — basic Tailwind layout, readable typography/spacing, buttons that look like buttons. No theme, no animations beyond D-06. Full CRT/teletype theming deferred to v2/Phase 4+.
- **D-11:** **No reconnection handling in Phase 1.** A page refresh or dropped connection loses the player's session — accepted gap, not a bug. Drop resilience is explicitly Phase 3 scope.

### Claude's Discretion

None — every gray area discussed reached an explicit user decision, including the researched-not-locked hosting comparison in D-08.

### Deferred Ideas (OUT OF SCOPE)

- Host-configurable agent count (1 vs 2) — deferred past Phase 1 per D-02.
- Spectator-seat behavior for eliminated players — expected to absorb the "eliminated player has nothing to do" gap; not scoped this phase.
- Reconnection/drop resilience — explicitly Phase 3 (LOBBY-06), per D-11.
- Full retro CRT/teletype theming — v2 (`THEME-01`), per D-10.
- The deckbuilder (Phase 2), the public lobby browser (Phase 3), chat (Phase 3), host seat/kick controls and AI personality readout beyond a name+personality label (Phase 3), round history log and Burn Track (Phase 4), transition/animation polish beyond D-06 (Phase 4).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-01 | Create a new game from the home page, receive a unique join code | See "Concrete Next.js Patterns" and "Don't Hand-Roll" (join-code generation); PartyKit room = join code, no separate mapping table needed |
| HOME-02 | Join a game by entering a join code | Same PartyKit room-per-match pattern; `party=match, id=<code>` |
| LOBBY-03 | Ready up; every seat's ready state visible to everyone | "Architecture Patterns" — one `RoomState` object, ready flags broadcast (safe, count/flag-only) |
| LOBBY-04 | Countdown to start once ≥50% of filled seats ready | Same `RoomState`; recompute threshold after every state-changing event (Pitfall 5) |
| LOBBY-05 | Host can start solo, auto-filling other seats with AI | D-07's fixed Handler-tier random-personality assignment; bot seats assigned at match-start transition only (not eagerly) |
| MATCH-01 | Match board renders the node-graph map as primary play surface | `duel12` map data shape (percentage x/y, already SVG-ready) — see "Code Examples" |
| MATCH-02 | Player assigns 2 actions per agent against the map each round | `Action` union in `packages/shared/src/orders.ts`; `legalOrders()` drives affordances |
| MATCH-03 | Submitted orders show only a locked-in indicator, never content, to other players | Fog-of-war-at-the-wire pitfall (Pitfall 1) — per-connection `projectView()`, never `broadcast()` of full state |
| MATCH-04 | Live "N of M submitted" count + visible countdown timer, no identity/content | `OPPONENT_COMMITTED` message already specified in `docs/ARCHITECTURE.md` §5; safe to broadcast (count-only) |
| MATCH-05 | Resolution as step-through report in fixed priority order | `ResolutionEvent[]` union (verified `packages/shared/src/orders.ts`) + D-05 click-to-advance gating — see "Code Examples" |
| MATCH-08 | Result screen naming winner and win condition | `MatchOutcome`/`OutcomeReason` (`'EXTRACTION' \| 'ELIMINATION' \| 'ROUND_LIMIT'`) already in engine's `checkVictory()` output |

</phase_requirements>

## Summary

Phase 1 is UI and realtime-transport work only — `packages/shared`, `packages/engine`, and `packages/ai` are complete, tested (69 green tests), and require no changes. The job is to build a genuinely thin vertical slice of `apps/web` (Next.js 15) and `apps/party` (room server) that gets a group of players from the home page through a lobby into a full 14-round match and a result screen, with minimal styling and one hardcoded loadout.

The single highest-priority open question — D-08's hosting architecture comparison — resolves clearly in favor of **keeping PartyKit** (the currently-locked choice), not switching to an all-Vercel + Upstash Redis alternative. As of the researched date (2026-08-19), Vercel's native WebSocket support is in **public beta** (announced 2026-06-22): connections are pinned to a single function instance, capped at a 5-minute default duration (extendable to a 30-minute beta ceiling on Pro/Enterprise only), and — critically — provide **no fan-out to multiple subscribers**. A 2-4 player match needing every connected player to receive the same round-resolution broadcast would require hand-building a Redis pub/sub coordination layer on top of a time-boxed connection primitive, then forcing a reconnect mid-match once the duration cap is hit (a single 14-round match at the locked 90-second timer already exceeds even the extended beta ceiling on order-phase time alone). That directly collides with D-11's locked "no reconnection handling in Phase 1" decision. PartyKit/Cloudflare Durable Objects have no such duration cap, provide per-connection send natively, and cost nothing beyond Cloudflare's Workers Free plan at this project's scale. Full comparison and citations below.

A `.planning/research/` directory already contains a same-milestone research pass (dated 2026-08-18, one day before this document) covering stack versions, architecture (lobby/match room split), pitfalls, and feature landscape in detail — that prior research is **incorporated and cited here rather than re-derived**, with this document's original contribution being the D-08 hosting comparison specifically requested by CONTEXT.md, plus phase-specific guidance (concrete code examples against this codebase's actual verified types, the click-to-advance resolution gating, local-identity persistence, and the `duel12` map data shape).

**Primary recommendation:** Keep PartyKit as locked in `docs/ARCHITECTURE.md`. Build one PartyKit room per match with an internal `phase` state machine (`LOBBY → LOADOUT → IN_GAME → ENDED`, distinct from the engine's own `MatchPhase`), never split lobby and match into two room types. Import `@berlin/engine`/`@berlin/ai` only from the `IN_GAME`-phase transition onward.

## Hosting Architecture Decision (D-08) — Full Comparison

CONTEXT.md requires a genuine comparison, not a hosting-location lookup, across four axes. All findings below are from live research on 2026-08-19.

### Axis 1: Can each option hold a persistent per-match room with all players connected simultaneously for up to 14 rounds, handling simultaneous-turn submission and fog-safe per-connection broadcast?

**PartyKit (Option A):** Yes, natively. One Cloudflare Durable Object per match (`party=match, id=matchId`) is a stateful, single-threaded object with a stable identity and no execution-duration ceiling — it can hold a match open for the full 14-round lifecycle (at the locked 90s timer, order phases alone total ≥21 minutes, plus lobby/loadout/resolution time). Per-connection sends are native: the room iterates its own connection list and calls `connection.send()` after computing `projectView(state, connectionPlayerId)` for each recipient — this is exactly the pattern already specified in `docs/ARCHITECTURE.md` §5 and validated against current PartyKit practice in `.planning/research/ARCHITECTURE.md`. [CITED: docs.partykit.io — Party.Server API, Scaling with Hibernation, Persisting state into storage — verified in prior research pass 2026-08-18]

**All-Vercel (Option B):** No, not without building a second system on top of it. Vercel's native WebSocket support reached **public beta on 2026-06-22** — this is the first date native WS support existed on Vercel at all; before that, Vercel serverless functions categorically could not hold a socket open, which is the entire reason `docs/ARCHITECTURE.md` §1 gave for choosing PartyKit in the first place. Under the new beta: "A single-instance, session-scoped connection can now run directly on Vercel Functions, with Fluid compute enabled... [it] doesn't give you fan-out, presence, or guaranteed ordering. Anything with multiple subscribers, multiple instances, or a longer-lived connection still needs one of the options below [Ably, Convex, Liveblocks, PartyKit, Pusher, PubNub, Firebase Realtime Database, Supabase]." [CITED: ably.com/vercel/websockets-on-vercel, vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel — web research, 2026-08-19] For a 2-4 player match where every player must receive the same resolution broadcast, this is a hard blocker on the "just Vercel" framing: "since each subscriber's connection can be pinned to a different Vercel Function instance, broadcasting one message requires building a coordination layer yourself, typically through a pub/sub channel in Redis." [CITED: ably.com/vercel/vercel-websockets-vs-ably — web research, 2026-08-19] The user's own proposed stack (Vercel + Upstash Redis) already anticipated needing Redis, but the practical implication is under-costed: this is not "Vercel with a cache," it's hand-building the room/broadcast abstraction that PartyKit already provides as a first-class primitive.

### Axis 2: Vercel's actual current WebSocket/SSE support for long-lived connections

- **Duration caps, not idle timeouts — a hard structural ceiling.** Default WebSocket function duration is **5 minutes**; an extended **30-minute ceiling exists only in beta, only on Pro and Enterprise plans**, with function-level configuration and specific Node.js/Python runtime version requirements. [CITED: vercel.com/changelog/websocket-support-is-now-in-public-beta — web research, 2026-08-19]
- **This directly conflicts with D-11.** A single match under this phase's locked settings (90s round timer × up to 14 rounds, plus lobby/loadout/resolution time) will exceed even the 30-minute extended beta ceiling well before the match ends. On Vercel, this is not an edge case to design reconnection for later — the platform *forces* a reconnect mid-match for every completed game, which is exactly the scenario D-11 explicitly declined to build in Phase 1 ("a page refresh or dropped connection loses the player's session — accepted gap"). Choosing Option B would make D-11 impossible to honor, not merely risky.
- **SSE has a comparable but distinct constraint:** streaming responses must begin sending within 25 seconds to maintain streaming capability, and function `maxDuration` still applies (default 300s under Fluid compute, up to 800s GA on Pro/Enterprise, 1800s in beta) — the same fundamental ceiling problem as WebSockets, plus SSE is one-directional (server→client only), so client→server order submission would still need a separate HTTP POST path layered on top, adding protocol complexity neither PartyKit nor a pure-WebSocket approach requires. [CITED: vercel.com/docs/functions/configuring-functions/duration — web research, 2026-08-19]
- **Local dev requires a different toolchain.** WebSocket support locally requires running `vercel dev` instead of `next dev`, "since only the Vercel runtime injects the upgrade handler" — a workflow divergence from the rest of the Next.js dev loop. [CITED: web research synthesis, multiple sources, 2026-08-19]

### Axis 3: Local-dev story for both

- **PartyKit:** `npx partykit dev` runs a local server that mirrors the production Durable Object runtime — this is the already-standard workflow noted in `.planning/research/STACK.md`. **Known gap, already flagged in ROADMAP.md's Research Flags:** hibernation (Durable Objects sleeping between messages) never triggers in local dev — it's a production/scale behavior. This means the hibernation-safety pattern (attach per-connection logic only in `onMessage`/`onClose`, never `onConnect`) must be verified against a **deployed** room with an explicit idle-then-message test, not assumed correct from local testing alone. [CITED: docs.partykit.io/guides/scaling-partykit-servers-with-hibernation — verified in prior research pass 2026-08-18; ROADMAP.md Research Flags]
- **All-Vercel:** Requires `vercel dev` specifically (not the standard `next dev` most of the Next.js codebase would otherwise use), plus a local or cloud-dev Redis instance for the pub/sub layer this architecture would additionally require per Axis 1. Two additional moving pieces (a non-default dev server + an external cache/pub-sub service) versus PartyKit's single local command. The WebSocket feature itself being in public beta as of this exact research month (August 2026) also means its local-dev behavior is more likely to change under this project than a feature that's been GA and stable.

### Axis 4: Cost/complexity to stand up for a solo indie project

- **PartyKit / Cloudflare:** Cloudflare Durable Objects have been available on the **Workers Free plan since 2025-04-07** — 100,000 requests/day, 13,000 GB-s/day duration, no cost until exceeded. [CITED: developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier — web research, 2026-08-19] PartyKit's own managed hosting has a zero-cost tier for development; commercial use deploys to your own Cloudflare account and pays only Cloudflare's usage-based pricing beyond the free tier — one vendor, one bill, and at a friends'-group scale (1-4 players, occasional matches) almost certainly free indefinitely.
- **All-Vercel:** Vercel Functions (Fluid compute) bills WebSocket connections as Active CPU time during the beta; Upstash Redis is a second, separately-billed vendor with its own free-tier command/day cap. Two vendors to provision, monitor, and reconcile pricing across, for a feature (native WS) that is itself pre-GA.
- **Complexity, net:** PartyKit's "one Durable Object per match" is the idiomatic, single-primitive answer to this exact game shape (stateful room, N connected clients, secret-until-reveal state, needs to outlive any single HTTP request). All-Vercel requires assembling that same capability from parts (time-boxed WS functions + hand-rolled Redis pub/sub fan-out + a forced reconnect story this phase has explicitly decided not to build) — on a WebSocket primitive that reached public beta one and a half months before this research was conducted.

### Recommendation

**Keep PartyKit (Option A).** Confidence: HIGH. This is not close: Option B fails Axis 1 outright (no native fan-out) and structurally conflicts with the already-locked D-11 (forced mid-match reconnection is unavoidable on Vercel's current duration caps, not a corner case). Nothing found in this research changes the choice already recorded in `docs/ARCHITECTURE.md` and `apps/party/CLAUDE.md`. The planner should treat D-08 as resolved: **PartyKit**, no further comparison needed downstream.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Home page (create/join by code) | Frontend Server (SSR) | Browser/Client | Next.js App Router page; join-code entry is a client component, but the route itself can be server-rendered |
| Join-code generation & lobby existence | API / Backend (PartyKit room) | — | Room id *is* the join code (or maps 1:1) — no separate database needed for v1; must be generated inside the room server, not the client |
| Lobby seat/ready state | API / Backend (PartyKit room) | Browser/Client (render only) | `RoomState` is authoritative in the room; client renders a snapshot and sends intents (`SET_SEAT`, ready-toggle) |
| AI auto-fill seat assignment | API / Backend (PartyKit room) | — | Bot seats assigned at match-start transition only, inside the room — must never be client-decided (client can't be trusted with "which seats are empty" timing) |
| Board rendering (SVG node graph) | Browser/Client | — | Static per-map data (`x`/`y` percentages), pure presentation; no server involvement beyond delivering `PlayerView` |
| Order composition & legality preview | Browser/Client | — | `legalOrders()` imported from `@berlin/engine` client-side for **predictive only** greying-out; never authoritative |
| Order validation & recording | API / Backend (PartyKit room) | — | `submitOrder()` from `@berlin/engine`, authoritative; server always re-validates regardless of client-side preview |
| Round resolution | API / Backend (PartyKit room) | — | `resolveRound()` — the sole authority; must run exactly once per round inside the room |
| Fog-of-war projection | API / Backend (PartyKit room) | — | `projectView()` is the **only** sanctioned path from `GameState` to any client; must run per-connection, never once for a `broadcast()` |
| Resolution step-through UI (click-to-advance) | Browser/Client | — | Consumes the already-fog-filtered `ResolutionEvent[]` log delivered in `ROUND_RESOLVED`; gating logic (which step is revealed) is pure client state, since the server has already redacted everything the client is allowed to hold |
| Bot decision-making | API / Backend (PartyKit room, via `@berlin/ai`) | — | `AIAgent.decide()` called server-side only; bots must go through the identical `submitOrder()` path as humans |
| Player identity / codename persistence | Browser/Client (localStorage) | — | No accounts; local-storage-only per D-09, consistent with the project's no-login constraint |
| Round timer / clock | API / Backend (PartyKit room, via alarms) | Browser/Client (render only) | Clock is server-authoritative per `apps/web/CLAUDE.md` rule 6 — client renders from `deadlineAt`, never a local countdown that can drift |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.23 (latest 15.x) | `apps/web` — App Router, RSC for lobby/home, client components for board | Already locked in `docs/ARCHITECTURE.md` §2; confirmed still current and actively patched. **Do not upgrade to Next.js 16** (now npm `latest`) mid-milestone — treat as a separate, deliberate decision. [CITED: npm registry, verified in prior research pass 2026-08-18; re-confirmed via this session's `npm view` for adjacent packages] |
| React | 19.2.x | UI runtime | Required peer for Next.js 15; RSC + `use()` assumed throughout the stack. [CITED: prior research pass 2026-08-18] |
| PartyKit | 0.0.115 | `apps/party` — authoritative room server, one Durable Object per match | Confirmed correct per the D-08 comparison above. [VERIFIED: npm registry — `npm view partykit version` → `0.0.115`, published 2025-09-11, repo `github.com/partykit/partykit`, created 2022-11-06 — checked this session, 2026-08-19] |
| `partysocket` | 1.3.0 | Client-side WebSocket connection from `apps/web` to the PartyKit room | Purpose-built for PartyKit; reconnect-with-backoff and a React hook (`usePartySocket`) included — do not hand-roll a second reconnection layer. [VERIFIED: npm registry — `npm view partysocket version` → `1.3.0`, published 2026-06-23, repo `github.com/cloudflare/partykit`, created 2023-01-02 — checked this session, 2026-08-19] |
| Zustand | 5.0.15 | Client-side session/UI state | Already the locked choice per `apps/web/CLAUDE.md`; holds `PlayerView` + UI concerns only, never mirrors `GameState`. [VERIFIED: npm registry — `npm view zustand version` → `5.0.15`, published 2026-08-13, repo `github.com/pmndrs/zustand`, created 2019-04-09 — checked this session, 2026-08-19] |
| Tailwind CSS | v4 (4.3.x) | Styling; D-10's "clean but plain" baseline | `@theme` CSS-variable model; a token swap later covers the deferred CRT theme without a rewrite. [CITED: prior research pass 2026-08-18] |
| Zod | ^4 (4.4.x) | Runtime validation at every trust boundary (`SUBMIT_ORDER`, all inbound room messages) | Not yet installed anywhere in the repo despite being referenced in `docs/ARCHITECTURE.md` §1 — this phase is the first to actually add it. Start on v4, not legacy v3. [VERIFIED: npm registry — `npm view zod version` → `4.4.3`, published 2026-08-17 (yesterday relative to this research), repo `github.com/colinhacks/zod`, created 2020-03-07 — checked this session, 2026-08-19] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Motion | 13.1.0 | Resolution step transitions (D-06's slide/fade) | Current name for what was `framer-motion`; same maintainer (`mattgperry`), synchronized releases. Provides `useReducedMotion` for the accessibility rule already established in `apps/web/CLAUDE.md`. [VERIFIED: npm registry — `npm view motion version` → `13.1.0`, published 2026-08-10, repo `github.com/motiondivision/motion`, maintainer `popmotion <mattgperry@gmail.com>` confirms legitimate lineage from the original Framer Motion author — checked this session, 2026-08-19] |
| `nanoid` (via `customAlphabet`) | 6.0.1 | Lobby join-code generation | Use `customAlphabet` with an unambiguous character set (no `0/O`, `1/I/l`) — a design choice, not a version choice. [VERIFIED: npm registry — `npm view nanoid version` → `6.0.1`, published 2026-08-07, repo `github.com/ai/nanoid`, created 2017-08-06 — checked this session, 2026-08-19] |
| PartyKit CLI (`npx partykit dev`) | matches `partykit` version above | Local dev server mirroring the production Durable Object runtime | Standard workflow; `apps/party` needs a `partykit.json` pointing at the compiled worker entry |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PartyKit | All-Vercel (Vercel Functions + Upstash Redis + WS/SSE) | Rejected for Phase 1 — see the dedicated D-08 comparison above. Revisit only if Vercel's native WS support reaches GA with fan-out and durable-connection guarantees, which is not the case as of 2026-08-19. |
| PartyKit | Raw Cloudflare Durable Objects (no PartyKit wrapper) | Viable, more boilerplate, no ergonomic gain for this phase's scope — `.planning/research/ARCHITECTURE.md` already ruled this out for the same reason `docs/ARCHITECTURE.md` §1 did. |
| Native inline SVG for the board | `@xyflow/react` (React Flow) | Only if the map ever needs user-driven layout (drag, auto-layout). `duel12` has designer-authored fixed `x`/`y` percentages — an editor library is unjustified complexity here. |

**Installation:**
```bash
# apps/web — core
pnpm --filter web add next@^15 react@^19 react-dom@^19 partysocket zustand zod motion nanoid

# apps/web — dev deps
pnpm --filter web add -D tailwindcss@^4 @tailwindcss/postcss

# apps/party — core
pnpm --filter party add partykit zod nanoid
pnpm --filter party add @berlin/shared @berlin/engine @berlin/ai   # workspace:*
```

**Version verification:** All package versions above were checked directly against the npm registry on 2026-08-19 (`npm view <pkg> version`, `time.modified`, `time.created`, `repository.url`) — see the `[VERIFIED: npm registry]` tags. No `npm view <pkg> scripts.postinstall` output was returned for any of the six packages checked (partysocket, partykit, zod, zustand, motion, nanoid), i.e. none declare a postinstall script — no suspicious-script signal found.

## Package Legitimacy Audit

| Package | Registry | Age | Source Repo | Verdict | Disposition |
|---------|----------|-----|-------------|---------|-------------|
| `partysocket` | npm | ~3.6 yrs (created 2023-01-02) | `github.com/cloudflare/partykit` | OK | Approved |
| `partykit` | npm | ~4 yrs (created 2022-11-06) | `github.com/partykit/partykit` | OK | Approved |
| `zod` | npm | ~6.4 yrs (created 2020-03-07) | `github.com/colinhacks/zod` | OK | Approved |
| `zustand` | npm | ~7.3 yrs (created 2019-04-09) | `github.com/pmndrs/zustand` | OK | Approved |
| `motion` | npm | package slot active since 2013; current maintainer confirmed as original Framer Motion author (`popmotion`/`mattgperry`) | `github.com/motiondivision/motion` | OK | Approved |
| `nanoid` | npm | ~9 yrs (created 2017-08-06) | `github.com/ai/nanoid` | OK | Approved |
| `tailwindcss` | npm | ~8.8 yrs (created 2017-10-06) | `github.com/tailwindlabs/tailwindcss` | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

Note: the automated `gsd-tools query package-legitimacy check` seam was unavailable in this session (binary not found at any of the expected install paths). All verdicts above were determined manually via direct `npm view` registry queries (version, `time.created`, `time.modified`, `repository.url`, and a `postinstall`-script check) rather than the seam's structured signals (download counts were not independently queried). All seven packages are long-established (3-13 years old) with legitimate, well-known source repositories and no `[ASSUMED]` package-name provenance risk — they were already locked as project dependencies in `docs/ARCHITECTURE.md` and cross-checked against the npm registry in the same-milestone prior research pass (`.planning/research/STACK.md`, 2026-08-18) before this session re-verified them independently. The planner does not need a `checkpoint:human-verify` task for any of these installs, but should re-run the seam-based check if it becomes available before Phase 1 execution, and treat any *new* package introduced during planning (not in this list) as requiring the full protocol.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER — apps/web (Next.js 15, Vercel)                             │
│                                                                        │
│  Home page ──creates/joins──▶ Lobby UI ──ready-up──▶ Match board      │
│   (join code entry)            (seats, ready flags)   (SVG map,       │
│                                                          order composer)│
│                                                                        │
│  Holds ONLY: PlayerView (in-match) + local RoomState snapshot (lobby) │
│  @berlin/engine imported for PREDICTIVE legality preview only         │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ WebSocket (PartySocket), party="match", id=joinCode
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PARTYKIT MATCH ROOM — apps/party (1 Durable Object per match)        │
│                                                                        │
│  RoomState { phase: LOBBY|LOADOUT|IN_GAME|ENDED, seats, readyFlags,   │
│              joinCode, hostId, loadouts, gameState? }                 │
│                                                                        │
│  LOBBY:    SET_SEAT / ready-toggle / kick → recompute ≥50% threshold  │
│  LOADOUT:  every seat locked to Phantom preset (D-01) — instant       │
│  IN_GAME:  gameState = createMatch(config, seed)  ◀── engine boundary │
│            submitOrder() per agent → all committed OR onAlarm deadline│
│            resolveRound() → { state', log: ResolutionEvent[] }        │
│            projectView(state', playerId) PER CONNECTION → send        │
│  ENDED:    result screen data held briefly, room evicts               │
│                                                                        │
│  Bot seats (D-07, Handler tier): projectView() → @berlin/ai decide()  │
│            → delayed submitOrder() via same path as humans            │
└─────────────────────────────────────────────────────────────────────┘
```

Source: adapted from `.planning/research/ARCHITECTURE.md` (same-milestone prior research, 2026-08-18) and `docs/ARCHITECTURE.md` §2/§5, with the D-08 recommendation applied (no change from what those documents already specify) and Phase 1's specific scope (no `lobbies` directory room — that's Phase 3's public browser; no loadout editing — that's Phase 2).

### Recommended Project Structure

```
apps/party/src/
├── index.ts              # exports the Party.Server class(es) for the platform to route
├── match/
│   ├── MatchRoom.ts       # onStart, onConnect, onMessage, onAlarm, onClose
│   ├── state.ts           # RoomState shape, phase transitions
│   ├── handlers/
│   │   ├── lobby.ts       # SET_SEAT, kick(deferred Phase 3), ready-up, countdown — NEVER imports @berlin/engine
│   │   ├── loadout.ts     # Phase 1: locks every seat to PHANTOM, no validation UI needed yet
│   │   ├── orders.ts      # SUBMIT_ORDER, RETRACT_ORDER → submitOrder() from @berlin/engine
│   │   └── pause.ts       # out of scope Phase 1 (no pause UI in success criteria) — stub or omit
│   ├── botRunner.ts       # calls @berlin/ai per bot seat, delayed submission (Pitfall 6)
│   └── clock.ts           # onAlarm-driven 90s round deadline (D-04), auto-Hold on expiry
└── (lobbies/ directory room — Phase 3, do not build now)

apps/web/
├── app/
│   ├── page.tsx                    # home: create / join by code
│   ├── lobby/[code]/page.tsx       # lobby: seats, ready-up, countdown
│   └── match/[code]/page.tsx       # match: board, order composer, resolution step-through, result
├── components/
│   ├── board/                      # SVG map, node/edge rendering, order composer
│   ├── lobby/                      # seat list, ready toggle, codename editor
│   └── resolution/                 # click-to-advance step-through (D-05/D-06)
└── lib/
    ├── socket.ts                   # thin PartySocket wrapper (do not re-implement reconnect logic)
    ├── store.ts                    # Zustand: PlayerView + local RoomState snapshot + UI state
    ├── identity.ts                 # codename generation + localStorage persistence (D-09)
    └── formatting.ts
```

### Structure Rationale

- **`handlers/lobby.ts` never imports `@berlin/engine`** — enforces the same purity boundary the rest of the codebase already relies on; lobby bookkeeping (seats, ready flags, join code) is `apps/party`-local state until the `LOADOUT → IN_GAME` transition creates `GameState` exactly once.
- **No `lobbies/` directory room this phase** — the public lobby browser is explicitly HOME-03/Phase 3. Phase 1's `HOME-02` (join by code) needs nothing beyond the match room itself.
- **`handlers/pause.ts` and full host-kick are out of this phase's success criteria** — `docs/ARCHITECTURE.md` §5's protocol includes `REQUEST_PAUSE`/`ANSWER_PAUSE` and host-kick, but neither appears in Phase 1's requirement IDs (LOBBY-01/LOBBY-02 are Phase 3). Stub or omit rather than half-build.

### Pattern 1: Phase-gated single room (lobby + match in one Durable Object)

**What:** One PartyKit room per match, carrying a `phase` field that gates which handlers are legal and when `GameState` gets created.
**When to use:** This project, always — the lobby and the match share a 1:1 lifecycle with the same players.
**Example — the one call site where lobby and match state actually meet:**
```ts
// apps/party/src/match/handlers/loadout.ts
// Called once, on the LOADOUT → IN_GAME transition.
function startMatch(room: RoomState): RoomState {
  if (room.phase !== 'LOADOUT' || !allSeatsLoadedOut(room)) return room;
  const config = buildMatchConfig(room.seats); // pure, apps/party-local; Phase 1 hardcodes PHANTOM
  const gameState = createMatch(config, room.matchId); // @berlin/engine — deterministic from seed
  return { ...room, phase: 'IN_GAME', gameState };
}
```
Source: `.planning/research/ARCHITECTURE.md` (verified against `docs/ARCHITECTURE.md` §4's `createMatch(settings, seed): GameState` signature).

**Important distinction for the planner:** the room's own `RoomState.phase` (`'LOBBY' | 'LOADOUT' | 'IN_GAME' | 'ENDED'`, an `apps/party`-local type) is **not** the same as the engine's `MatchPhase` (`'LOBBY' | 'LOADOUT' | 'ORDERS' | 'RESOLVED' | 'FINISHED'`, [VERIFIED: `packages/shared/src/enums.ts:20`] `export type MatchPhase = 'LOBBY' | 'LOADOUT' | 'ORDERS' | 'RESOLVED' | 'FINISHED';`). The engine's `MatchPhase` only exists once `GameState` exists (i.e. from `IN_GAME` onward) and describes the *round-level* phase; the room's `phase` describes the *match lifecycle*. Do not conflate the two names when wiring the room — a value like `'ORDERS'` belongs to `GameState.phase`, not `RoomState.phase`.

### Pattern 2: Per-connection fog projection, never `broadcast()` for game content

**What:** Every outbound message touching order/resolution content is built by iterating live connections and calling `projectView(state, connectionPlayerId)` per recipient.
**When to use:** Always, for anything derived from `GameState`. `broadcast()` is reserved for genuinely public, identical-for-everyone data (e.g. the ready-count or the round timer's `deadlineAt`).
**Example:**
```ts
// apps/party/src/match/handlers/orders.ts (illustrative — after resolveRound())
for (const conn of room.getConnections()) {
  const playerId = room.connectionPlayerId(conn);
  if (!playerId) continue;
  const view = projectView(state, playerId); // @berlin/engine — the ONLY sanctioned boundary
  conn.send(JSON.stringify({ type: 'ROUND_RESOLVED', view, log: view.lastRound }));
}
```
Source: `docs/ARCHITECTURE.md` §5 (`ROUND_RESOLVED { log, view }` message shape) + `.planning/research/PITFALLS.md` Pitfall 1 (fog-of-war-at-the-wire).

### Pattern 3: Click-to-advance resolution step-through (D-05/D-06)

**What:** The client receives the full, already-fog-filtered `ResolutionEvent[]` for the round (via `PlayerView.lastRound`, [VERIFIED: `packages/shared/src/view.ts:122`] `readonly lastRound: readonly ResolutionEvent[];`) in one message, then reveals events one at a time on user click, never all at once.
**When to use:** Every round resolution in this phase, per D-05.
**Example:**
```tsx
// apps/web/components/resolution/StepThrough.tsx
'use client';
import { useState } from 'react';
import type { ResolutionEvent } from '@berlin/shared';

export function StepThrough({ log }: { log: readonly ResolutionEvent[] }) {
  const [revealed, setRevealed] = useState(1); // reveal ROUND_START immediately; gate the rest

  const visible = log.slice(0, revealed);
  const done = revealed >= log.length;

  return (
    <div>
      {visible.map((event, i) => (
        <ResolutionEventRow key={i} event={event} isLatest={i === revealed - 1} />
      ))}
      {!done && (
        <button onClick={() => setRevealed((n) => n + 1)}>Next</button>
      )}
    </div>
  );
}
```
The server has already redacted every event via `projectView()` before it reaches this component — the client-side gating logic's only job is *pacing* (never reveal event N+1 before the player has acknowledged event N), not *filtering*. This satisfies MATCH-05's "never reveals information ahead of its rules-defined step" because the fixed order is the array order the server already emitted, per the 11-step pipeline in `packages/engine/src/resolution/index.ts` [VERIFIED: `packages/engine/src/resolution/index.ts:39-49`] — the eleven `step*(ctx)` calls run in exactly the order `stepArm, stepTraps, stepDecoys, stepMovement, stepTrapTriggers, stepBlockades, stepBribes, stepWiretaps, stepStrikes, stepContested, stepObjectives`, and each emits its `ResolutionEvent`s at that point in the log — the array is already in rules-order; the UI must not reorder or batch it.

### Anti-Patterns to Avoid

- **`room.broadcast(fullStateOrEvent)` for anything resolution-related:** the natural, simplest implementation and exactly wrong — see Pitfall 1 below. Every PR touching order/resolution messages must show a per-connection loop.
- **Attaching listeners inside `onConnect`:** lost on Durable Object hibernation. Use `onMessage`/`onClose` exclusively for per-connection logic (Pitfall 3).
- **Bot orders submitted synchronously and instantly:** trivially identifies bot seats by timing and risks racing round-start logic (Pitfall 6) — must go through a scheduled delay via the room's own alarm mechanism, computed early but *released* late.
- **Splitting lobby and match into two PartyKit room types with a handoff:** doubles reconnection logic and reintroduces a state-migration bug class for zero benefit at ≤4 players (Anti-Pattern 1, `.planning/research/ARCHITECTURE.md`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnection with backoff | A custom retry/backoff loop in `apps/web/lib/socket.ts` | `partysocket` / `partysocket/react`'s `usePartySocket` | Purpose-built for PartyKit, already handles backoff; re-implementing risks a fog-of-war-adjacent bug (stale state surviving a reconnect) — though note D-11 means Phase 1 does not need to *handle* reconnection UX, just shouldn't actively fight the library's default behavior |
| Fan-out broadcast to N connections | A hand-rolled Redis pub/sub layer (the core of the rejected D-08 Option B) | PartyKit's native per-room connection list + per-connection `send()` | This is the entire reason PartyKit/Durable Objects were re-confirmed over an all-Vercel stack — see the D-08 comparison |
| Join-code uniqueness | A separate existence-check-then-insert against a database | `nanoid`'s `customAlphabet` + generate→claim→retry inside the room server (scoped to *active* lobbies only) | Avoids the join-code-collision race documented in Pitfall 5; no database needed for v1 |
| Legal-move enumeration on the client | A second, UI-side "what can this agent do" implementation | `legalOrders(view, agentId)` from `@berlin/engine`, imported client-side for prediction only | A second implementation will drift from the server's and can quietly hand the UI options a human doesn't actually have — `packages/engine/CLAUDE.md` states this explicitly |
| Victory condition / win explanation | Custom scoring logic in the result screen | `checkVictory()`'s output already surfaced via `GameState.outcome` / `PlayerView.outcome` (`MatchOutcome`, `OutcomeReason` = `'EXTRACTION' \| 'ELIMINATION' \| 'ROUND_LIMIT'` [VERIFIED: `packages/shared/src/enums.ts:26`] `export type OutcomeReason = 'EXTRACTION' \| 'ELIMINATION' \| 'ROUND_LIMIT';`) | Already computed authoritatively by the engine; the result screen is a pure render of `outcome` |

**Key insight:** every "don't hand-roll" item above traces back to the same rule already encoded in this repo's `CLAUDE.md` — the engine and shared types are the single source of truth for anything rules-related, and PartyKit is the single source of truth for anything connection/broadcast-related. Phase 1's job is wiring, not reimplementing either.

## Common Pitfalls

*Condensed from `.planning/research/PITFALLS.md` (same-milestone prior research pass, 2026-08-18), filtered to what's in-scope for Phase 1's specific success criteria. Full detail, warning signs, and recovery strategies are in that document — this section summarizes and adds Phase-1-specific framing.*

### Pitfall 1: Fog-of-war leaks at the wire, not just the type

**What goes wrong:** `PlayerView` is structurally safe, but `room.broadcast()` sending one payload to every connection (or full `GameState` in a debug/log path) bypasses that safety entirely — devtools sees everything, regardless of what the type system prevents.
**How to avoid:** Hard rule: the room never calls `broadcast()` with anything derived from `GameState`. Every outbound game-content message is built by iterating connections and calling `projectView()` per recipient (Pattern 2, above). Add a transport-level integration test (this is ROADMAP.md's "wire-level fog of war" research flag) that captures literal per-connection payload bytes across a simulated multi-player match and asserts no cross-player hidden data is present — this is the natural extension of the existing `packages/engine/tests/fog-leak.test.ts` pattern, moved to the `apps/party` boundary.
**Phase to address:** `apps/party` stand-up — must be a design decision before the first message type is wired, not a review comment after.

### Pitfall 2 / 2b: "Waiting for other players" reads as a hang; silent submission failure

**What goes wrong:** MATCH-04's "N of M submitted" indicator is exactly the mitigation for the first half of this; the second half is a player believing their order landed when a dropped connection or Zod validation failure means it didn't, discovered only via an unexplained auto-Hold at the 90s deadline.
**How to avoid:** The "locked in" UI state must be driven by an explicit server ack (`submitting → confirmed` or `submitting → rejected(reason)`), never an optimistic local flag set at click time. On rejection, return to composing with a visible error.
**Phase to address:** This phase — both the protocol (ack/reject response type) and the UI state machine are in MATCH-03/MATCH-04's scope.

### Pitfall 3: PartyKit hibernation silently drops `onConnect` handlers

**What goes wrong:** Cloudflare Durable Objects can hibernate between messages; listeners attached in `onConnect` are lost on wake. This project's 90-second order-composing window (D-04) is exactly the kind of idle gap where hibernation is likely in production.
**How to avoid:** Use only `onMessage`/`onClose` for per-connection logic; persist `GameState` to PartyKit storage after every mutation (it's already a small, serializable object by the engine's own design). **Local dev never triggers this** (ROADMAP.md flag) — verify with an explicit deployed idle-then-message test before considering the room server done, not just a local playtest.
**Phase to address:** Foundational room-server constraint, from the first line of `apps/party`.

### Pitfall 5: Lobby readiness/seat state are read-then-write races, not atomic transitions

**What goes wrong:** Join-code collisions, kick-during-ready-toggle races (deferred to Phase 3, but the ready-threshold recompute logic itself is Phase 1 scope), and bot-fill timing (assign eagerly vs. at match-start) are all classic read-modify-write bugs if each lobby message handler independently recomputes state.
**How to avoid:** Model the lobby as one authoritative `RoomState` object; every incoming lobby message is a pure transition function applied in arrival order (PartyKit rooms already process messages sequentially — don't fight this with async work mid-transition). Recompute the ≥50%-ready threshold after every state-changing event, not just ready-toggles. Assign bot seats only at the match-start transition, never eagerly when a seat becomes empty.
**Phase to address:** This phase — LOBBY-03/LOBBY-04/LOBBY-05 are exactly this state machine.

### Pitfall 6: Bots that think in milliseconds give themselves away

**What goes wrong:** `packages/ai` is validated at p99 <50ms — wired naively, a bot seat submits within milliseconds of round start, making it trivially identifiable and risking round-logic races.
**How to avoid:** Decouple *deciding* (fast, can happen immediately) from *submitting* (must be scheduled via the room's own alarm/timer with a randomized human-plausible delay, per `docs/ARCHITECTURE.md` §7's already-specified 1.5-4s padding). Bots route through the exact same `submitOrder()` validation/commit path as humans — no special-cased bot fast path.
**Phase to address:** Wherever `@berlin/ai` first gets wired into the live room — this phase, since LOBBY-05/AI-auto-fill is in scope.

### Pitfall (new, this document): Fixed-Handler-tier bot personality imbalance is a known, unfixed issue

**What goes wrong:** D-07 assigns AI seats a **random personality** at fixed Handler difficulty. `.planning/codebase/CONCERNS.md` documents that Katja (Ghost personality) wins 84% of duel matches even after all documented balance fixes — "validated and confirmed... a design problem, not a bot implementation bug." [VERIFIED: `.planning/codebase/CONCERNS.md:31-38`] "Katja wins 84% of duel matches even after all documented fixes... This must be solved before Phase 2 ships a playable board." A new player whose only AI opponent this phase happens to be a randomly-assigned Katja may have a skewed first impression, particularly in a 1-agent (D-02), 1v1-adjacent match on the `duel12` map.
**Why it happens:** This is upstream of Phase 1's scope — it's an AI/engine balance issue explicitly deferred ("Gameplay rule changes/rebalancing... out of scope for *this* milestone" per `.planning/REQUIREMENTS.md`'s Out of Scope table) and not something Phase 1 can or should fix.
**How to avoid (within Phase 1's scope):** Nothing to fix in code this phase — flag it as a known playtesting caveat, not a blocker. If the planner wants a cheap mitigation without touching AI balance, note that D-07 already avoids the *worst* version of this (it explicitly chose Handler over the lowest tier specifically to sidestep raw difficulty-based frustration) — but personality-based imbalance is a separate axis D-07 does not address and this research does not recommend Phase 1 try to address either.
**Warning signs:** Playtest feedback specifically calling out one bot personality as unbeatable or trivial.
**Phase to address:** Not this phase — flag for a future balance-focused milestone informed by real playtest data, per the existing "Katja over-strong" entry in CONCERNS.md.

## Code Examples

### The `duel12` map's data shape (verified, for SVG board rendering)

```ts
// packages/engine/src/content/maps/duel12.ts — VERIFIED via Read this session
// Each node: { id: NodeId, name: string, sector: Sector, x: number, y: number,
//              edges: {to: NodeId, type: EdgeType}[], isUBahnStation: boolean,
//              extractionFor: Sector | null, hasInformant: boolean }
// x/y are PERCENTAGES (0-100), already designed for a responsive SVG viewBox —
// no code changes needed to render a different map later.
export const DUEL_12: MapDefinition = build(); // 12 nodes, 3 U-Bahn stations, 2 checkpoints
```
[VERIFIED: `packages/engine/src/content/maps/duel12.ts:22-35, 73-86`] — raw node list confirms exact field names and value ranges, e.g. `{ id: 'kurfurstendamm', name: 'Kurfürstendamm', sector: 'BLUE', x: 10, y: 45 }` through `{ id: 'karl_marx_allee', name: 'Karl-Marx-Allee', sector: 'RED', x: 80, y: 58, extractionFor: 'RED' }`. `EdgeType` is `'STREET' | 'TUNNEL' | 'CHECKPOINT'` [VERIFIED: `packages/shared/src/enums.ts:17`]. An SVG board component needs only: a `viewBox` matching the 0-100 percentage range, `<circle>`/`<g>` per node positioned at `x%`/`y%`, and `<path>` edges styled by `type` (solid for `STREET`, dashed for `TUNNEL`, double-line for `CHECKPOINT` per `docs/GAME_DESIGN.md` §3.1) — no per-map code required.

### The `Action` union agents submit (verified — drives the order composer)

```ts
// packages/shared/src/orders.ts — VERIFIED via Read this session
export type Action =
  | { readonly type: 'HOLD' }
  | { readonly type: 'MOVE'; readonly to: NodeId }
  | { readonly type: 'SPRINT'; readonly via: NodeId; readonly to: NodeId; readonly cardId?: CardId }
  | { readonly type: 'WIRETAP'; readonly cardId: CardId; readonly target: NodeId }
  | { readonly type: 'BRIBE'; readonly cardId: CardId }
  | { readonly type: 'DECOY'; readonly cardId: CardId; readonly target: NodeId }
  | { readonly type: 'SAFEHOUSE'; readonly cardId: CardId }
  | { readonly type: 'STRIKE'; readonly cardId: CardId; readonly target: NodeId }
  | { readonly type: 'AMBUSH'; readonly cardId: CardId };
```
[VERIFIED: `packages/shared/src/orders.ts:12-29`] — the order composer's affordances (MATCH-02) enumerate against this union, filtered per-agent by `legalOrders(view, agentId)`. Note MOVE/SPRINT vs. the five operation actions are mutually exclusive within one agent's two actions per `packages/engine/CLAUDE.md`: "`legalOrders` stops offering MOVE/SPRINT once an operation is in the prefix... strikes and bribes resolve from the post-movement node." The UI must enforce (or at minimum reflect) that ordering constraint, not just present all nine action types uniformly.

### Match settings shape (verified — for `createMatch()` config in Phase 1's hardcoded lobby)

```ts
// packages/shared/src/settings.ts — VERIFIED via Read this session
export interface MatchSettings {
  readonly seats: readonly SeatConfig[];
  readonly agentsPerPlayer: 1 | 2;       // D-02 locks this to 1
  readonly mapId: string;                // D-03 locks this to 'duel-12' (see DUEL_12.id)
  readonly teams: boolean;               // false — FFA only, no 2v2 UI this phase
  readonly roundTimerSeconds: number | null; // D-04 locks this to 90
  readonly pausesPerPlayer: number;      // pause flow out of scope this phase — set 0
  readonly roundLimit: number;           // 14 per docs/GAME_DESIGN.md §2 default
  readonly dossierCount: number;
  readonly startingIntel: number;
  readonly blockadeMode: BlockadeMode;   // 'MIXED' default per docs/GAME_DESIGN.md §2
  readonly rulesetId: string;
}
```
[VERIFIED: `packages/shared/src/settings.ts:19-32`] — every field the Phase 1 lobby must populate before calling `createMatch()` is enumerated here; there is no field for loadouts (those are submitted separately per-player, hardcoded to `PHANTOM` per D-01 in Phase 1).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| "Vercel can't do WebSockets, full stop" (the premise `docs/ARCHITECTURE.md` §1 was written against) | Native WebSocket support in **public beta**, single-instance/session-scoped, capped duration, no fan-out | 2026-06-22 | Does not change the D-08 recommendation (see full comparison above) — the capability exists now but is structurally unsuited to this project's multi-connection, long-lived-room requirement and conflicts with D-11 |
| Cloudflare Durable Objects requiring a Workers Paid plan | Available on Workers **Free** plan | 2025-04-07 | Removes any cost objection to PartyKit for a solo/friends-group project — free tier is very likely sufficient indefinitely at this scale |
| `framer-motion` as the primary npm package name | `motion` is now the forward-facing package name, same maintainer, synchronized releases | Ongoing (both still maintained) | No functional impact; use `motion`'s React entry point (`motion/react`) per the already-verified maintainer lineage |
| `reactflow` (deprecated package name) | `@xyflow/react` | Prior to this research (not date-verified) | Not applicable to this project — neither should be installed; noted only so nobody accidentally installs the deprecated name if this decision is ever revisited |

**Deprecated/outdated:**
- The framing "PartyKit vs. hosting-location-lookup" in earlier project discussion (per CONTEXT.md's own note that the user initially proposed webhooks) — webhooks are server-to-server callbacks and cannot deliver live client push (round timer, "N of M submitted"); this research confirms the correct alternative mechanism is WebSockets (via PartyKit), not webhooks, matching the correction already noted in CONTEXT.md D-08.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cloudflare Durable Objects Workers Free plan limits (100k req/day, 13,000 GB-s/day) remain sufficient for this project's expected scale through Phase 1 and beyond | Hosting Architecture Decision, Axis 4 | If a friends-group's play sessions somehow exceed this (very unlikely at 1-4 players, occasional matches), a small paid Cloudflare bill would apply — not a blocker, just a cost surprise; verify current limits at deploy time since Cloudflare pricing/limits can change |
| A2 | Vercel's WebSocket public beta terms (5 min default / 30 min extended-beta ceiling, no fan-out) will not materially change before this phase ships | Hosting Architecture Decision, Axis 1-2 | Low risk to the *recommendation* (PartyKit) since even generous improvements to Vercel's beta wouldn't erase the fan-out/duration-cap combination without a major platform change; worth a quick re-check only if Phase 1 execution is delayed by months |
| A3 | The `RoomState.phase` naming (`LOBBY/LOADOUT/IN_GAME/ENDED`) proposed in `.planning/research/ARCHITECTURE.md` is a good fit and doesn't need to change for Phase 1's narrower scope (no `lobbies` directory room, no pause flow) | Architecture Patterns, Pattern 1 | Low — this is an `apps/party`-internal type with no cross-package contract; the planner is free to simplify it further if Phase 1's scope doesn't need the full state machine (e.g., collapsing LOBBY/LOADOUT since Phase 1 hardcodes the loadout) |

**Assessment:** All claims materially affecting the D-08 hosting decision were `[CITED]` from live web research conducted this session (2026-08-19), not `[ASSUMED]` from training data — this matters given D-08's explicit "one-way, hard to reverse" reversibility note in CONTEXT.md. The three items above are low-risk secondary claims that don't threaten the core recommendation.

## Open Questions

1. **Should Phase 1's `RoomState.phase` collapse `LOBBY` and `LOADOUT` into one phase, given D-01 hardcodes the loadout?**
   - What we know: `.planning/research/ARCHITECTURE.md` proposes a 4-phase state machine (`LOBBY → LOADOUT → IN_GAME → ENDED`) designed for the full milestone, where `LOADOUT` is meaningful once Phase 2's deckbuilder exists.
   - What's unclear: whether Phase 1 needs a distinct `LOADOUT` phase at all when every seat is locked to `PHANTOM` with no player action required.
   - Recommendation: the planner can choose either — keep the 4-phase shape for forward-compatibility with Phase 2 (recommended, since Phase 2 depends on Phase 1 per ROADMAP.md and a mid-milestone phase-shape change is exactly the kind of avoidable churn this research is meant to prevent), or collapse to 3 phases and expand later. Either choice satisfies this phase's success criteria; document whichever is chosen in the plan.

2. **Exact bot "think time" delay range for D-07's fixed Handler-tier bots.**
   - What we know: `docs/ARCHITECTURE.md` §7 specifies "1.5-4s 🔧" as a tuning target, and Pitfall 6 confirms this must be a scheduled delay, not inline computation.
   - What's unclear: whether 1.5-4s is generous enough against a 90-second round timer (D-04) without making bots feel sluggish, or whether it should scale with the number of legal orders available (more choices = more plausible "thinking").
   - Recommendation: use the existing 🔧 range as a starting point (it's already in the ruleset object per `packages/engine/CLAUDE.md`'s "tuning target" convention) rather than deriving a new number; treat as a "revisit after first playtest" item, consistent with how CONCERNS.md already treats bot-timing questions.

3. **Does the `duel12` map (designed for "solo and 1v1") need any visual/UX accommodation for 3-4 players, even though D-03 explicitly defers the "does it need adaptation" question?**
   - What we know: D-03 says "left to research/planning, not decided here"; the map data itself has no player-count field — any number of seats can technically be assigned to its 12 nodes.
   - What's unclear: whether 3-4 agents on a 12-node map (vs. the FFA-16/FFA-18 maps referenced in `docs/GAME_DESIGN.md` §3.1 but not yet implemented in code) creates crowding that hurts the "hiding is a real strategy" design pillar.
   - Recommendation: ship `duel12` as-is for all player counts in Phase 1 (it's the only implemented map — building FFA-16/18 is out of scope per D-03's own framing) and treat any crowding complaint as playtest feedback for a later phase, not a Phase 1 blocker.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22+ | Whole project | ✓ (per `@types/node@22.20.1` in root `package.json`) | 22+ | — |
| pnpm 9.15.4 | Workspace management | ✓ (per `packageManager` field in root `package.json`, [VERIFIED: `package.json:5`] `"packageManager": "pnpm@9.15.4"`) | 9.15.4 | — |
| PartyKit CLI | Local `apps/party` dev server | Not yet installed (`apps/party` has no `package.json` — confirmed skeleton, only `CLAUDE.md` files present) | To install: `partykit@0.0.115` | None needed — this is a fresh install, not a missing tool |
| `vercel dev` | Not needed — Option B rejected | N/A | N/A | N/A |
| Cloudflare account | PartyKit deployment (beyond local dev) | Unknown — not verifiable from this codebase | — | Local dev (`npx partykit dev`) does not require one; only needed at actual deploy time, which is likely out of scope for Phase 1's plan itself (a plan can target "deployable," verified separately) |

**Missing dependencies with no fallback:** none — `apps/web` and `apps/party` are both fresh installs (skeletons with no `package.json` yet per `.planning/codebase/STRUCTURE.md`), so "missing" here just means "not yet installed by this phase's plan," not an environment gap.

**Missing dependencies with fallback:** none applicable.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (already root-installed) [VERIFIED: `.planning/codebase/STACK.md:29`] |
| Config file | `vitest.config.ts` (root) — currently scoped to `packages/**/tests/**/*.test.ts`; must be extended to include `apps/web` and `apps/party` test paths this phase |
| Quick run command | `pnpm test` (runs full Vitest suite — no separate "quick" script exists yet; the planner should add a filtered script, e.g. `pnpm test --project apps` or similar, if per-app fast iteration is needed) |
| Full suite command | `pnpm test` |

Playwright is referenced in `docs/ARCHITECTURE.md` §6 as the intended E2E tool ("Lobby → loadout → 3 rounds → resolution, on a seeded match") but is **not yet installed** anywhere in the repo (confirmed absent from root `package.json` devDependencies). This is a genuine Wave 0 gap, not an oversight to skip.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| HOME-01/HOME-02 | Create game → unique join code; second browser joins by code, lands in same lobby | E2E (Playwright, two browser contexts) | `pnpm test:e2e -- home.spec.ts` | ❌ Wave 0 |
| LOBBY-03/LOBBY-04 | Ready-up visible to all seats; countdown at ≥50% ready | Integration (PartyKit room, simulated connections) | `pnpm test -- lobby.test.ts` | ❌ Wave 0 |
| LOBBY-05 | Solo start auto-fills empty seats with Handler-tier AI | Integration (room + `@berlin/ai`) | `pnpm test -- botfill.test.ts` | ❌ Wave 0 |
| MATCH-01/MATCH-02 | Board renders `duel12`; 2 actions/agent assignable and submittable | Component/integration (React Testing Library or Playwright) | `pnpm test -- board.test.ts` | ❌ Wave 0 |
| MATCH-03/MATCH-04 | No order content leaks pre-resolution; count-only + timer visible | **Integration, wire-level** (captures literal per-connection payload bytes) — this is ROADMAP.md's flagged research item, must be a real automated test, not a manual devtools check | `pnpm test -- fog-wire.test.ts` | ❌ Wave 0 (highest priority new test in this phase — see Pitfall 1) |
| MATCH-05 | Step-through never reveals event N+1 before N acknowledged; matches 11-step order | Unit (client-side gating state) + integration (log order matches `resolution/index.ts`) | `pnpm test -- stepthrough.test.ts` | ❌ Wave 0 |
| MATCH-08 | Result screen names winner + correct `OutcomeReason` for all three win paths | Integration (drive engine to each of `EXTRACTION`/`ELIMINATION`/`ROUND_LIMIT`, assert UI render) | `pnpm test -- result.test.ts` | ❌ Wave 0 |
| (research flag) | 4-bot concurrent timing — message queue depth/latency at n=4 | Manual/scripted spike (not a standing CI test) | ad hoc script against a local `partykit dev` room with 4 simulated bot connections | ❌ Wave 0 — one-time measurement, not ongoing suite |

### Sampling Rate

- **Per task commit:** `pnpm test` (fast — packages already run in milliseconds per CONCERNS.md; new `apps/*` tests should stay fast since they're integration tests against a local room, not real network)
- **Per wave merge:** `pnpm test` + `pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work`; the wire-level fog test (MATCH-03/04) and the 4-bot timing spike are non-negotiable gates given they're the two highest-severity risks this research identified (Pitfall 1, and the n=4 timing research flag).

### Wave 0 Gaps

- [ ] Install Playwright for `apps/web` E2E (`docs/ARCHITECTURE.md` §6 already specifies this tool; not yet installed)
- [ ] Extend `vitest.config.ts` include pattern to cover `apps/web/**/*.test.ts` and `apps/party/**/*.test.ts`
- [ ] `apps/party/tests/fog-wire.test.ts` — the wire-level fog-of-war integration test (highest priority; extends the pattern in `packages/engine/tests/fog-leak.test.ts` one layer up per Pitfall 1)
- [ ] A one-time 4-bot concurrent-timing measurement script (not a standing test) — per the ROADMAP.md research flag, run against a local `partykit dev` room before shipping
- [ ] `apps/party/tests/helpers.ts` — simulated-connection test harness for the PartyKit room (mirrors `packages/engine/tests/helpers.ts`'s existing pattern)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No accounts in v1 (D-09, project-wide constraint) — not applicable |
| V3 Session Management | Partial | Reconnection/session-token handling is explicitly out of scope this phase (D-11) — no session-management control needed *yet*, but note this is a deliberate, temporary gap, not an oversight; Phase 3 (LOBBY-06) is where V3 becomes applicable |
| V4 Access Control | Yes | Host-only lobby actions (kick, resize) are Phase 3 scope, not Phase 1 — but the *general* pattern (server checks sender identity against stored authority, never trusts client-hidden UI) applies now to any Phase-1-scoped host action, if any exists in the final plan |
| V5 Input Validation | Yes | Zod schemas validate every inbound `apps/party` message before it reaches `@berlin/engine`; server always re-runs `legalOrders()`/`submitOrder()` server-side regardless of client-side prediction (already an established project rule, `docs/ARCHITECTURE.md` §1 point 4) |
| V6 Cryptography | No | No secrets/crypto surface introduced this phase (join codes are not security tokens — see below) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Fog-of-war leak at the wire (opponent positions/safehouse/traps reaching a client that shouldn't see them) | Information Disclosure | Per-connection `projectView()` for every game-content message, never `broadcast()`; wire-level integration test (Pitfall 1, MATCH-03/04's Wave 0 test) |
| Client submits an order the engine would reject if it saw full state (illegal move, cooldown violation, insufficient Intel) | Tampering | Server always re-validates via `legalOrders()`/`submitOrder()` against its own authoritative `GameState` — never trust client-side legality UI as an enforcement layer (already an established project rule) |
| Untrusted/malformed WebSocket message crashing the room or corrupting state | Denial of Service / Tampering | Zod-validate every inbound message before it touches the engine; room catches errors and returns an `ERROR` message rather than crashing (`docs/ARCHITECTURE.md` §5, existing rule) |
| Join code guessable/short enough to be brute-forced into someone else's private lobby | Information Disclosure | Use `nanoid`'s `customAlphabet` with sufficient length/entropy for a private-lobby code (this is a *usability* code, not a security token, but should not be trivially guessable within a short match's lifetime — a 6-character unambiguous-alphabet code is standard and sufficient at this scale) |
| Debug/inspection endpoint exposing full `GameState` left reachable in production | Information Disclosure | Do not add any debug route/message type that serializes full `GameState`; if one is added for local development, gate it behind a build-time flag stripped from production bundles (Pitfall 1's explicit warning) |

## Sources

### Primary (HIGH confidence)

- `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, `docs/AI_OPPONENTS.md` (this repo) — read in full this session
- `packages/shared/src/view.ts`, `orders.ts`, `settings.ts`, `enums.ts`; `packages/engine/src/resolution/index.ts`; `packages/engine/src/content/maps/duel12.ts`, `loadouts.ts`; `packages/ai/src/personalities/index.ts`, `difficulty.ts` — all read directly this session, verbatim quotes cited with line ranges throughout
- npm registry direct queries (`npm view`) for `partysocket`, `partykit`, `zod`, `zustand`, `motion`, `nanoid`, `tailwindcss` — version, `time.created`, `time.modified`, `repository.url`, `scripts.postinstall` — run this session, 2026-08-19
- `.planning/codebase/ARCHITECTURE.md`, `STACK.md`, `STRUCTURE.md`, `CONCERNS.md` — generated codebase analysis, read in full this session

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md`, `FEATURES.md` — same-milestone prior research pass, dated 2026-08-18 (one day before this document), read in full this session and incorporated/condensed rather than re-derived
- [WebSockets on Vercel: native support, limits, and your options](https://ably.com/vercel/websockets-on-vercel) — WebSearch, 2026-08-19
- [Vercel WebSockets vs Ably: fan-out, presence, and ordering compared](https://ably.com/vercel/vercel-websockets-vs-ably) — WebSearch, 2026-08-19
- [WebSocket support is now in Public Beta - Vercel](https://vercel.com/changelog/websocket-support-is-now-in-public-beta) — WebSearch, 2026-08-19
- [Publish and Subscribe to Realtime Data on Vercel — Vercel Knowledge Base](https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel) — WebSearch, 2026-08-19
- [Configuring Maximum Duration for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration) — WebSearch, 2026-08-19
- [Cloudflare Durable Objects free tier changelog, 2025-04-07](https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/) — WebSearch, 2026-08-19

### Tertiary (LOW confidence)

- General WebSearch synthesis on `vercel dev` local WebSocket workflow requirements — cross-checked across multiple result snippets, not a single authoritative doc; flag for re-verification at actual implementation time if Option B is ever reconsidered (unlikely per this research's recommendation)

## Metadata

**Confidence breakdown:**
- Hosting architecture decision (D-08): HIGH — multiple independent, dated, official/near-official sources (Vercel's own changelog and KB, Ably's technical comparison, Cloudflare's own changelog) converge on the same structural constraints; the recommendation does not hinge on any single source
- Standard stack: HIGH — every version number independently re-verified against the npm registry this session, consistent with the prior day's research pass
- Architecture patterns: HIGH — this project's own `docs/ARCHITECTURE.md` is unusually detailed and code-verified (69 tests); the lobby/match split is corroborated by official PartyKit documentation
- Pitfalls: MEDIUM — domain patterns are well-established, but project-specific severity is inferred rather than measured against live incident data (consistent with the prior research pass's own confidence assessment)
- Code examples: HIGH — every type/field name used is `[VERIFIED]` via direct `Read` of the source file this session, not recalled from training data

**Research date:** 2026-08-19
**Valid until:** ~30 days for the architecture/stack sections (stable domain); **7 days for the D-08 hosting comparison specifically**, since it depends on Vercel's WebSocket feature being in an actively-evolving public beta — if Phase 1 planning is delayed materially beyond a week or two, re-check Vercel's changelog before treating the recommendation as still current (though the structural fan-out/duration-cap argument is unlikely to fully reverse in that window).
