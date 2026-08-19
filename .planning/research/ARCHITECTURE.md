# Architecture Research

**Domain:** Realtime multiplayer hidden-movement web game (PartyKit + Next.js + pure TS rules engine)
**Researched:** 2026-08-18
**Confidence:** MEDIUM-HIGH — this project already has an unusually detailed, code-verified architecture (`docs/ARCHITECTURE.md`, written specifically for this game); this document validates it against current PartyKit ecosystem practice and fills the one real gap (lobby-state vs. match-state separation), rather than proposing a new architecture from scratch.

This is a **subsequent-milestone** research pass. The prior milestone (Phases 0/1/3) already built and tested `packages/shared`, `packages/engine`, `packages/ai`. This milestone's job is `apps/web` + `apps/party`, which are currently skeletons. The question is not "what architecture should this game have" (already answered, in depth, in `docs/ARCHITECTURE.md`) — it's "does that plan hold up against how PartyKit apps are actually built in practice, and how do lobby and match state divide."

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER — apps/web (Next.js, Vercel)                                │
│                                                                        │
│   Client components: board (SVG), order composer, replay animator,    │
│   lobby UI, deckbuilder                                               │
│    ├─ holds ONLY a PlayerView (+ local lobby state) — never GameState │
│    └─ imports @berlin/engine for LOCAL PREDICTION ONLY                │
│         (legalOrders() for greyed-out affordances, Intel preview —    │
│          never authoritative; server re-validates everything)         │
└──────────────┬─────────────────────────────┬──────────────────────────┘
               │ WebSocket (PartySocket)      │ WebSocket (PartySocket)
               │ party: "match"               │ party: "lobbies" (directory)
               ▼                              ▼
┌───────────────────────────────┐   ┌──────────────────────────────────┐
│  MATCH ROOM — apps/party       │   │  LOBBIES DIRECTORY ROOM           │
│  party="match", id=matchId     │   │  party="lobbies", id="index"      │
│  1 Durable Object per match    │   │  1 singleton Durable Object       │
│                                 │   │                                    │
│  Internal phase state machine: │   │  Purpose: public browsable list   │
│   LOBBY → LOADOUT → IN_GAME    │   │  of open (joinable) matches.      │
│   → ENDED                      │   │  Each match room announces        │
│                                 │◀──┤  itself here on create/seat-     │
│  ┌───────────────────────────┐│   │  change/close (internal fetch or  │
│  │ AUTHORITATIVE GameState   ││   │  onConnect broadcast to this room)│
│  │ created lazily at LOBBY→  ││   └──────────────────────────────────┘
│  │ LOADOUT transition        ││
│  │ @berlin/engine            ││
│  │ @berlin/ai (bot seats)    ││
│  │ projectView() per seat    ││
│  └───────────────────────────┘│
└───────────────────────────────┘
```

**Core invariant, unchanged from the existing docs and re-confirmed by research:** the full `GameState` exists in exactly one place, inside the match room's Durable Object. Nothing else in the system — not the browser, not the lobbies directory room — ever holds it. Everything a client receives crosses `projectView()`.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `apps/web` client | Render UI from `PlayerView` + lobby snapshot; predictive legality only | Next.js App Router, React client components, Zustand for session/UI state, `PartySocket` for the wire |
| Match room (`apps/party`, party type `match`) | Own `GameState`, validate/collect orders, run `resolveRound()`, run bot seats, broadcast per-seat `PlayerView` | `PartyServer`-style class (`onConnect`, `onMessage`, `onAlarm`), one Durable Object per `matchId` |
| Lobbies directory room (`apps/party`, party type `lobbies`, singleton id) | Ephemeral registry of open/joinable matches for the public browse list | Same PartyKit project, second "party" (see "Using multiple parties per project"), in-memory `Map`, no persistence needed for v1 |
| `@berlin/engine` | Pure rules: `createMatch`, `legalOrders`, `submitOrder`, `resolveRound`, `projectView` | Imported by both browser (prediction) and match room (authority) — same package, two runtimes |
| `@berlin/ai` | Bot decision-making per seat | Imported by match room only, never by browser |

## PartyKit Fit — Validated

Researched against current PartyKit documentation and the Cloudflare acquisition status (PartyKit joined Cloudflare in 2024; the project — including `partyserver`, the class-based server API — remains actively maintained as of March 2026 with regular releases). The existing stack decision in `docs/ARCHITECTURE.md` §1 holds:

- **Room-per-match is the idiomatic PartyKit pattern.** PartyKit guarantees that connecting to a party with the same room id routes to the same Durable-Object-backed instance, and each unique id spins up an isolated instance with no shared state between rooms — this is exactly the "one Durable Object per match" model already chosen.
- **`onStart` / `onConnect` / `onMessage` / `onClose` / `onAlarm` is the standard lifecycle** for a `Party.Server`-style class. `onStart` is the right place to hydrate room state from storage on cold start/wake; time-based behavior (round deadlines, auto-hold) belongs in `onAlarm`, matching the existing constraint that the engine itself never touches a clock.
- **Storage + alarms are the persistence primitive**, not a database. PartyKit's own guidance is that live/session state belongs in room memory (or the room's small transactional KV storage for surviving hibernation/restarts), and that a database is for durable cross-session data — which lines up with this project's decision to defer Postgres to a later phase and treat a match as ephemeral for v1.
- **Hibernation matters for cost/scale but changes one thing operationally:** if hibernation is enabled, don't attach ad-hoc event listeners inside `onConnect` — they're lost on wake. Route everything through the class's `onMessage`/`onClose` handlers, which the existing message-handler design in `apps/party/src/handlers/` already implies.
- **"Using multiple parties per project"** is a first-class PartyKit feature (`/parties/:party/:room-id`), and it is the mechanism this document uses to justify a separate `lobbies` directory party from the per-match `match` party, without introducing a second deployment target or a database.

Net: the ecosystem confirms the plan already on file. No architecture change is warranted; this research adds the lobby/match split (below) and de-risks a couple of specific mechanics.

## Gap Filled: Lobby State vs. Match State

`docs/ARCHITECTURE.md` §5 defines a protocol (`JOIN`, `SET_SETTINGS`, `SET_SEAT`, `SUBMIT_LOADOUT`, `SUBMIT_ORDER`, ...) inside **one room**, without separating "this is lobby-phase state" from "this is in-match state," and `PROJECT.md`'s Active requirements add things the original protocol doesn't cover: a join code, a **public browsable list of open lobbies**, host kick/resize, ready-up with a ≥50%-of-filled-seats threshold, and solo mode (AI auto-fills empty seats). Two structural decisions resolve this cleanly:

### Decision 1: One room per match, with an internal phase state machine (not two room types)

Do **not** split "lobby room" and "match room" into two different PartyKit rooms that hand off state at start — that requires serializing lobby state into match state across a room boundary, doubles the message-handling surface, and reintroduces the exact "state migration" bug class this project's engine purity rules exist to avoid.

Instead, one match room (`party=match`, `id=matchId`) owns a single `RoomState` object with a `phase` field:

```ts
type RoomPhase = "LOBBY" | "LOADOUT" | "IN_GAME" | "ENDED";

interface RoomState {
  phase: RoomPhase;
  matchId: string;
  joinCode: string;           // short human-entered code, separate from matchId
  hostId: PlayerId;
  seats: SeatConfig[];        // size, human/bot, personality/difficulty (host-only edits)
  readyFlags: Record<PlayerId, boolean>;
  loadouts: Record<PlayerId, CardId[]>;
  gameState?: GameState;      // present only once phase >= LOADOUT→IN_GAME transition commits
}
```

- `LOBBY`: join code + public listing active, `SET_SETTINGS`/`SET_SEAT`/host-kick apply, ready-up tracked, countdown starts once ≥50% of filled seats are ready (per `PROJECT.md`).
- `LOADOUT`: seats locked, each player edits their 10-card loadout; this is the same deckbuilder component reused in-lobby per the existing "Key Decision" that deck editing and the home-page deckbuilder are one system.
- `IN_GAME`: `gameState = createMatch(config, seed)` is created exactly once at this transition; from here on `GameState` is the only mutable object and every mutation goes through `@berlin/engine`. This is the one moment `apps/party` calls into engine's "create" boundary — everything before it is lobby bookkeping the engine never sees.
- `ENDED`: room stays alive briefly for the result screen / reconnect grace period, then the Durable Object can be allowed to evict (no persistence needed for v1, matching the "no accounts" constraint).

This keeps `@berlin/engine` and `@berlin/ai` completely uninvolved in lobby mechanics — join codes, ready flags, host kick, and the public-list heartbeat are pure `apps/party` concerns, never touching the pure-function boundary. It also means reconnection is trivial in both phases: rejoin the same room id, get a full `RoomState` (lobby) or `VIEW` (match) snapshot, you're current — no separate reconnect logic per phase.

### Decision 2: A second, singleton PartyKit party for the public lobby list

The "join by code" path needs nothing beyond the match room itself (client connects directly to `party=match, id=joinCode-resolved-matchId`). The "browse public open lobbies" path needs a **directory** — something that knows about every currently-open match room, independent of any single match room's lifecycle. Model this as PartyKit's multi-party feature, not as a database table:

- `party=lobbies, id="index"` — a single well-known room, always the same id, that every client can subscribe to on the home page to receive a live list of open lobbies (`{ matchId, joinCode, hostName, seatsFilled, seatsTotal, phase: "LOBBY" }[]`).
- Each match room announces itself to the directory room on phase transitions that matter (`LOBBY` created → add; seat count/host name changes → update; `phase` leaves `LOBBY` or room closes → remove). This is a same-Worker, same-deployment call — PartyKit rooms can address each other via the platform's internal room-to-room fetch, so no external HTTP round trip or extra infra is needed.
- The directory room holds this list in memory only (a `Map`), consistent with the "no accounts, no persistence for v1" constraint — a restart of the directory room just means the list rebuilds as match rooms reconnect/re-announce, which is an acceptable v1 tradeoff (flag this as a known gap, not a blocker).

This is the practice that keeps the two concerns cleanly separated: **lobby state is per-match, ephemeral, and owned by the match room; the directory is a thin, separately-scoped index of lobbies, not a database and not part of `GameState`.**

## Recommended Project Structure

```
apps/party/src/
├── index.ts              # exports both Party.Server classes (match, lobbies) for the platform to route
├── match/
│   ├── MatchRoom.ts       # Party.Server class: onStart, onConnect, onMessage, onAlarm, onClose
│   ├── state.ts           # RoomState shape, phase transitions (LOBBY→LOADOUT→IN_GAME→ENDED)
│   ├── handlers/
│   │   ├── lobby.ts       # SET_SETTINGS, SET_SEAT, kick, ready-up, countdown (engine untouched)
│   │   ├── loadout.ts     # SUBMIT_LOADOUT validation (calls engine's loadout validator)
│   │   ├── orders.ts      # SUBMIT_ORDER, RETRACT_ORDER → submitOrder() from @berlin/engine
│   │   └── pause.ts       # REQUEST_PAUSE / ANSWER_PAUSE unanimity poll
│   ├── botRunner.ts       # calls @berlin/ai per bot seat, pads latency 1.5–4s
│   ├── clock.ts           # onAlarm-driven round deadline, auto-Hold on expiry
│   └── directoryClient.ts # thin wrapper: announce/update/remove this room in the lobbies directory
└── lobbies/
    └── LobbiesRoom.ts     # Party.Server singleton: in-memory Map<matchId, LobbySummary>, broadcasts on change
```

### Structure Rationale

- **`match/` vs `lobbies/` as sibling directories**, not nested — they are two different PartyKit party types with independent lifecycles (one instance per match vs. exactly one instance total), and conflating them in one class would blur the phase boundary this document argues for.
- **`handlers/lobby.ts` never imports `@berlin/engine`.** This is the concrete enforcement of "lobby bookkeeping never touches the pure-function boundary" — a lint/import-boundary rule worth adding alongside the existing `shared ← engine ← ai ← apps` rule.
- **`botRunner.ts` and `clock.ts` are separated from `handlers/orders.ts`** because they're both triggers for the same `resolveRound()` call (all-committed vs. deadline-expired) — keeping them distinct makes the "who calls resolveRound and why" question answerable by reading one file each, not by tracing a shared handler.

## Architectural Patterns

### Pattern 1: Phase-gated single room (lobby + match in one Durable Object)

**What:** One PartyKit room per match, carrying a `phase` field that gates which handlers are legal and when `GameState` gets created.
**When to use:** Any game where the lobby (seat/settings negotiation) and the match itself share a natural 1:1 lifecycle with the same group of players — true here since seats are fixed once the match starts.
**Trade-offs:** Simpler reconnection and no state-migration bug class, at the cost of a slightly larger room class with phase-conditional logic. Worth it here; the alternative (two room types with a handoff) is strictly more code for no benefit at this player count (≤4).

### Pattern 2: Singleton directory party for cross-room discovery

**What:** A second PartyKit party type with a fixed, well-known room id, used purely as a live index over other rooms' summary data.
**When to use:** Whenever you need "browse open X" without standing up a database, and X's authoritative lifecycle already lives in per-instance rooms.
**Trade-offs:** In-memory only means the list is best-effort (a directory-room restart temporarily empties the list until match rooms next announce) — acceptable for v1 given the no-persistence constraint; revisit if the public list needs to survive a directory-room cold-start with zero gaps (would need a Postgres-backed listing in a later phase, same moment accounts land).

### Pattern 3: Engine as a two-runtime import, never a network call

**What:** `@berlin/engine` is imported directly by both the browser bundle (for predictive `legalOrders()`/cost preview) and the match room (for authoritative `submitOrder()`/`resolveRound()`) — same source, compiled twice, never called over the wire.
**When to use:** Whenever the client needs instant, correct-feeling affordances (greyed-out illegal moves, live Intel cost) but the server must remain the sole authority. This is what makes a hidden-information game feel responsive without trusting the client.
**Trade-offs:** Requires strict discipline that the engine stays free of I/O/randomness/`Date.now()` (already an enforced project rule) — any violation breaks silently in one runtime and not the other. Already validated and tested in this codebase (`packages/engine/tests/determinism.test.ts`, `fog-leak.test.ts`).

**Example — the one call site where lobby and match state actually meet:**
```ts
// apps/party/src/match/handlers/loadout.ts
// Called only on the LOADOUT → IN_GAME transition, exactly once per match.
function startMatch(room: RoomState): RoomState {
  if (room.phase !== "LOADOUT" || !allLoadoutsSubmitted(room)) return room;
  const config = buildMatchConfig(room.seats, room.loadouts); // pure, apps/party-local
  const gameState = createMatch(config, room.matchId);        // @berlin/engine — seed derived, not random
  return { ...room, phase: "IN_GAME", gameState };
}
```

## Data Flow

### Request Flow — Order Submission (unchanged from `docs/ARCHITECTURE.md`, re-confirmed correct)

```
User picks action (composer)
    ↓
apps/web calls legalOrders(view, agentId) from @berlin/engine  — LOCAL, predictive only
    ↓ SUBMIT_ORDER (Zod-validated)
apps/party/match handler → submitOrder(state, playerId, order)  — AUTHORITATIVE
    ↓ (all committed OR onAlarm deadline)
resolveRound(state) → { state', log: ResolutionEvent[] }
    ↓
projectView(state', playerId) per seat
    ↓ ROUND_RESOLVED { view, log }
apps/web updates Zustand store, animates replay from log
```

### Request Flow — Lobby (new; not previously specified as distinct from match flow)

```
Home page → apps/web connects to `party=lobbies, id="index"` (read-only subscribe)
    ↓ LOBBY_LIST { entries: LobbySummary[] }
User clicks "create" → apps/web connects to `party=match, id=<new matchId>`
    ↓ (room phase=LOBBY) → directoryClient announces to lobbies room
User clicks "join by code" → apps/web resolves code → connects directly to `party=match, id=<matchId>`
    ↓ SET_SEAT / ready-up / kick — all handled inside match room, engine untouched
    ↓ ≥50% seats ready → countdown → phase=LOADOUT → phase=IN_GAME (createMatch called once)
```

### State Management

- **Match room:** `RoomState.gameState` is the only mutable `GameState`, immutable-per-round (clone-modify-return via engine). Everything before `IN_GAME` (`seats`, `readyFlags`, `loadouts`) is plain room-local state, never touched by `@berlin/engine`.
- **Lobbies directory room:** A flat `Map<matchId, LobbySummary>`, updated only by announce/update/remove messages from match rooms — never reads `GameState`, never needs fog-of-war logic (it only ever holds public summary fields).
- **Browser:** Two independent client-side slices — a lobby-list subscription (home page) and a per-match `PlayerView` + local `RoomState` snapshot (in-lobby / in-match), both in Zustand, cleared when navigating away from a match.

## Build Order Implications

The dependency chain for this milestone, in the order components must exist to unblock the next:

1. **Match room skeleton with phase state machine** (`RoomState`, `LOBBY`/`LOADOUT`/`IN_GAME`/`ENDED`, `onConnect`/`onMessage` scaffolding) — everything else in `apps/party` depends on this shape existing first, since lobby handlers and order handlers both read/write the same `RoomState`.
2. **Lobby handlers** (`SET_SETTINGS`, `SET_SEAT`, kick, ready-up, countdown) — depends on 1 only; does not depend on `@berlin/engine` at all, so this can be built and demoed (lobby UI, join-by-code, ready-up) before any match logic exists. Good candidate for an early phase since it's pure UI + room-state plumbing with no engine risk.
3. **Loadout/deckbuilder wiring** — depends on 2 (needs seats locked) and reuses the same component in both the home-page deckbuilder and in-lobby class-editing flows (per existing Key Decision) — build the deckbuilder component once, mount it twice.
4. **Match start + order submission + resolution wiring** — depends on 1–3; this is where `@berlin/engine`'s `createMatch`/`submitOrder`/`resolveRound`/`projectView` actually get called from `apps/party` for the first time in this milestone. Highest-risk integration point (four-player timing, simultaneous commit, fog projection over the wire) — sequence this after the lower-risk lobby/UI work is proven end-to-end on the wire.
5. **Bot runner** — depends on 4 (needs a working round-resolution loop to slot into) but is otherwise independent of the human order path; can be built in parallel with UI polish once 4 lands, since `@berlin/ai` already exists and is tested.
6. **Lobbies directory room + public list UI** — depends on 1 (needs match rooms to announce from) but not on 3/4/5; can be built any time after match rooms exist in `LOBBY` phase, in parallel with loadout/match work.

**Sequencing takeaway for the roadmap:** lobby mechanics (2, 3, 6) are lower-risk and engine-independent — they can be a phase (or several) on their own, proving the wire protocol and PartyKit room lifecycle before the harder simultaneous-order/resolution phase. The order-submission and resolution wiring (4) is the phase most likely to need deeper research or a spike, given `CONCERNS.md` already flags untested real-time 4-action timing under load.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1–4 players, single match (v1 target) | Current design as specified — no changes needed. One Durable Object per match easily handles 4 WebSocket connections and a ~60s round cadence. |
| Many concurrent matches | No change to per-match architecture — PartyKit's model is "one isolated Durable Object per room," so concurrent matches don't share load or state by construction. The only new pressure is on the singleton `lobbies` directory room, which fans out updates to every home-page visitor; if that list grows large, throttle/batch directory broadcasts rather than pushing on every seat-count change. |
| Persistent accounts / cross-device (later milestone, out of scope now) | This is where Neon Postgres (already planned for "Phase 6+" in the existing docs) enters — match history, profiles, durable lobby listings surviving directory-room restarts. Does not change the match-room architecture, only adds a write-behind path from room state to Postgres at match end. |

### Scaling Priorities

1. **First real risk is not scale, it's timing correctness at n=4** — simultaneous 2-actions-per-agent submission, deadline handling, and reconnection mid-round. This is a correctness problem, not a scale problem, and should be treated as the highest-research-priority phase regardless of eventual traffic.
2. **Second, if it ever matters:** the lobbies directory room's broadcast fan-out, which is the one component in this design that doesn't get isolation "for free" from PartyKit's per-room model — worth a note in the roadmap, not an immediate mitigation.

## Anti-Patterns

### Anti-Pattern 1: Splitting "lobby room" and "match room" into two PartyKit room types with a handoff

**What people do:** Create a `party=lobby` room for pre-match negotiation, then spin up a separate `party=match` room and serialize/transfer lobby state into it when the match starts.
**Why it's wrong:** Doubles the reconnection logic, introduces a state-migration bug class (what if a player reconnects mid-handoff?), and duplicates seat/settings types across two message protocols for no benefit at ≤4 players.
**Do this instead:** One room per match with an internal `phase` field (Decision 1, above). Reconnection is always "rejoin this room id, get the current snapshot," regardless of phase.

### Anti-Pattern 2: Building the public lobby list as a database query

**What people do:** Reach for Postgres/a REST endpoint to list open matches, because "that's what you do for a directory."
**Why it's wrong:** Adds a persistence layer and a deploy dependency this project has explicitly deferred (no accounts, no cross-device sync for v1), for data that's inherently ephemeral (a lobby that's been open 10 minutes with no match started).
**Do this instead:** A singleton PartyKit room (Decision 2) as a live in-memory index, updated by the match rooms themselves. Add Postgres only when accounts/persistence land in a later milestone.

### Anti-Pattern 3: Letting lobby handlers reach into `GameState` "just to check something early"

**What people do:** During the `LOBBY`/`LOADOUT` phase, a handler peeks at engine internals (e.g., calls a "preview" version of `createMatch` to show projected seed/map info) because it's convenient.
**Why it's wrong:** Reintroduces exactly the coupling this codebase's dependency-direction rule (`shared ← engine ← ai ← apps`) and purity rule exist to prevent — lobby code should never need engine code to exist before `IN_GAME`, and any exception makes "when does GameState first exist" ambiguous, which breaks the golden-replay/determinism testing story (`(seed, config, orders)` must fully determine a match from a single, well-defined creation point).
**Do this instead:** Keep all pre-`IN_GAME` previews (map thumbnail, ruleset summary, deck legality) as pure `apps/party`/`apps/web` logic reading static `content/` data directly, not through `createMatch`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PartyKit / Cloudflare Durable Objects | `apps/party` deploys via `partykit deploy` (existing plan) — actively maintained under Cloudflare as of 2026, no sunset risk found in research | Confirms existing "Hosting: undecided → Cloudflare via PartyKit" note in `PROJECT.md` can be resolved: Cloudflare (via PartyKit) is the correct target, not a separate host |
| Vercel | `apps/web`, `NEXT_PUBLIC_PARTYKIT_HOST` is the only environment coupling (per existing docs) | No change; PR previews point at a staging PartyKit host |
| Neon Postgres | Deferred to a later milestone (accounts/persistence) | Not needed for lobby directory or match state in this milestone — see Anti-Pattern 2 |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `apps/web` ↔ match room | WebSocket (`PartySocket`), Zod-validated messages both directions | Existing protocol in `docs/ARCHITECTURE.md` §5 covers match messages; lobby messages (`SET_SETTINGS`, `SET_SEAT`, ready-up, kick) share the same socket/room, gated by `phase` |
| `apps/web` (home page) ↔ lobbies directory room | WebSocket, subscribe-only for most clients | New boundary this research adds; lightweight, no auth needed since only public summary fields are exposed |
| match room ↔ lobbies directory room | Room-to-room (same PartyKit deployment, internal call) | Announce/update/remove on phase-relevant changes only, not every message, to avoid unnecessary fan-out |
| `apps/party` ↔ `@berlin/engine` / `@berlin/ai` | Direct in-process function calls (no network) | Only from `IN_GAME`-phase handlers onward; lobby handlers must not import either package (Anti-Pattern 3) |

## Sources

- [Party.Server (Server API) — PartyKit Docs](https://docs.partykit.io/reference/partyserver-api/) — MEDIUM confidence (official docs, cross-checked)
- [Party.Server — New API for a programmable primitive — PartyKit blog](https://blog.partykit.io/posts/partyserver-api/) — MEDIUM confidence
- [Scaling PartyKit servers with Hibernation — PartyKit Docs](https://docs.partykit.io/guides/scaling-partykit-servers-with-hibernation/) — MEDIUM confidence
- [Persisting state into storage — PartyKit Docs](https://docs.partykit.io/guides/persisting-state-into-storage/) — MEDIUM confidence
- [Scheduling tasks with Alarms — PartyKit Docs](https://docs.partykit.io/guides/scheduling-tasks-with-alarms/) — MEDIUM confidence
- [Using multiple parties per project — PartyKit Docs](https://docs.partykit.io/guides/using-multiple-parties-per-project/) — MEDIUM confidence
- [How PartyKit works — PartyKit Docs](https://docs.partykit.io/how-partykit-works/) — MEDIUM confidence
- [PartyKit is joining Cloudflare! — PartyKit blog](https://blog.partykit.io/posts/partykit-is-joining-cloudflare/) — MEDIUM confidence (acquisition context)
- [cloudflare/partykit releases — GitHub](https://github.com/cloudflare/partykit/releases) — MEDIUM confidence (confirms active maintenance into 2026)
- `docs/ARCHITECTURE.md` (this repo) — HIGH confidence, primary source; existing project-specific design, code-verified against 69 passing tests
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md` (this repo) — HIGH confidence, generated from the actual codebase

---
*Architecture research for: Berlin 1988 — realtime multiplayer hidden-movement web game (PartyKit + Next.js)*
*Researched: 2026-08-18*
