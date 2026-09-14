# Phase 1: Playable Skeleton - Pattern Map

**Mapped:** 2026-08-19
**Files analyzed:** 22 (new files across `apps/party`, `apps/web`; zero `packages/*` changes expected)
**Analogs found:** 22 / 22 (all are role-match or convention-match — `apps/web` and `apps/party` are empty skeletons, so no exact prior-implementation analog exists anywhere in this repo; every analog below is either a `packages/*` source file whose *contract* the new file must consume correctly, or a documented convention from the relevant `CLAUDE.md`)

**Important framing for the planner:** There is no existing controller/component/route code in this repo to copy UI or handler *style* from — `apps/web` and `apps/party` are skeletons (CLAUDE.md only). What *does* exist, and is load-bearing, is the exact shape of the five engine functions and the `PlayerView`/`GameState`/`Action`/`ResolutionEvent` types every new file must consume or produce correctly. Treat the `packages/*` excerpts below as the hard contract, and the protocol table in `docs/ARCHITECTURE.md` §5 as the wire format. Where CLAUDE.md files state a rule directly (e.g. "never `broadcast()` game content"), that rule is quoted verbatim as it is the pattern.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/party/src/index.ts` | config/entry | event-driven | `packages/engine/src/index.ts` (barrel convention) | convention-match |
| `apps/party/src/match/MatchRoom.ts` | controller (room server) | event-driven, request-response | `packages/engine/src/submitOrder.ts` + `packages/engine/src/resolution/index.ts` (what it orchestrates) + `apps/party/CLAUDE.md` rules | role-match (orchestration target, not a room-server analog) |
| `apps/party/src/match/state.ts` | model | CRUD | `packages/shared/src/state.ts` (`GameState` shape) | analog for shape conventions |
| `apps/party/src/match/handlers/lobby.ts` | controller (message handler) | event-driven | `packages/engine/src/submitOrder.ts` (validate → return result, never throw) | pattern-match (error-handling style) |
| `apps/party/src/match/handlers/loadout.ts` | controller (message handler) | event-driven | `packages/engine/src/createMatch.ts` (`startMatch` calls `createMatch()` per RESEARCH.md Pattern 1) | exact (documented call site) |
| `apps/party/src/match/handlers/orders.ts` | controller (message handler) | request-response, CRUD | `packages/engine/src/submitOrder.ts` (direct caller) | exact |
| `apps/party/src/match/botRunner.ts` | service | event-driven | `packages/ai/src/agent.ts` (`AIAgent.decide()`) | exact |
| `apps/party/src/match/clock.ts` | service | event-driven | `docs/ARCHITECTURE.md` §5 clock/alarm design notes | convention-match (no code analog; engine has no clock) |
| `apps/party/src/protocol.ts` (Zod schemas, if not placed in shared) | validation/config | request-response | `packages/shared/src/orders.ts` (`Action` union — the schema must mirror this discriminated union) | pattern-match |
| `apps/web/app/page.tsx` | route/component (home) | request-response | none in-repo; `01-UI-SPEC.md` Screens table + Copywriting Contract | no analog (new pattern) |
| `apps/web/app/lobby/[code]/page.tsx` | route/component | event-driven (WS-driven render) | `packages/shared/src/settings.ts` (`MatchSettings`/`SeatConfig` — what the lobby collects) | pattern-match (data shape only) |
| `apps/web/app/match/[code]/page.tsx` | route/component | event-driven | `packages/shared/src/view.ts` (`PlayerView` — the only prop shape this route may hold) | exact (structural contract) |
| `apps/web/components/board/Board.tsx` (SVG map) | component | transform (render) | `packages/engine/src/content/maps/duel12.ts` (data shape consumed) | exact (data source) |
| `apps/web/components/board/OrderComposer.tsx` | component | request-response | `packages/engine/src/legalOrders.ts` + `packages/shared/src/orders.ts` (`Action` union) | exact |
| `apps/web/components/resolution/StepThrough.tsx` | component | streaming (click-paced reveal) | RESEARCH.md Pattern 3 (`PlayerView.lastRound: ResolutionEvent[]`) — code example already written against this codebase's verified types | exact (already codebase-verified in RESEARCH.md) |
| `apps/web/components/lobby/SeatList.tsx` | component | CRUD (render of seat state) | `packages/shared/src/settings.ts` (`SeatConfig`) | pattern-match |
| `apps/web/components/result/ResultScreen.tsx` | component | transform (render) | `packages/engine/src/victory.ts` (`scoreOf`) + `packages/shared/src/enums.ts` (`OutcomeReason`) | exact |
| `apps/web/lib/socket.ts` | utility (transport wrapper) | streaming | `docs/ARCHITECTURE.md` §5 protocol table (message shapes to type against) | pattern-match (no code analog; `partysocket` is the library) |
| `apps/web/lib/store.ts` | store (Zustand) | event-driven | `apps/web/CLAUDE.md` rule 5 ("Zustand holds session and UI state only... don't mirror [game state]") | convention-match |
| `apps/web/lib/identity.ts` | utility | CRUD (localStorage) | none in-repo (new pattern, D-09) | no analog |
| `apps/web/lib/formatting.ts` | utility | transform | none in-repo | no analog |
| Fog-of-war wire test (new, `apps/party/tests/` or similar) | test | request-response | `packages/engine/tests/fog-leak.test.ts` (referenced pattern, not read this pass — see Note below) | exact (explicitly named in CONTEXT.md/RESEARCH.md as the pattern to extend to the wire boundary) |

## Pattern Assignments

### `apps/party/src/match/handlers/loadout.ts` (controller, event-driven)

**Analog:** `packages/engine/src/createMatch.ts`, called per the exact site RESEARCH.md already specifies.

**Core pattern** (RESEARCH.md Pattern 1, verified against `createMatch()`'s real signature):
```ts
// apps/party/src/match/handlers/loadout.ts
// Called once, on the LOADOUT -> IN_GAME transition.
function startMatch(room: RoomState): RoomState {
  if (room.phase !== 'LOADOUT' || !allSeatsLoadedOut(room)) return room;
  const config = buildMatchConfig(room.seats); // apps/party-local, pure; Phase 1 hardcodes PHANTOM (D-01)
  const gameState = createMatch(config, room.matchId); // @berlin/engine — deterministic from seed
  return { ...room, phase: 'IN_GAME', gameState };
}
```

**`createMatch()`'s real signature and settings shape to build `config` against** (`packages/engine/src/createMatch.ts:26`, `packages/shared/src/settings.ts:19-32`):
```ts
export function createMatch(settings: MatchSettings, seed: string): GameState
export interface MatchSettings {
  readonly seats: readonly SeatConfig[];
  readonly agentsPerPlayer: 1 | 2;       // D-02 locks this to 1
  readonly mapId: string;                // D-03 locks this to 'duel-12'
  readonly teams: boolean;               // false — FFA only
  readonly roundTimerSeconds: number | null; // D-04 locks this to 90
  readonly pausesPerPlayer: number;      // 0 — pause flow out of scope Phase 1
  readonly roundLimit: number;           // 14
  readonly dossierCount: number;
  readonly startingIntel: number;
  readonly blockadeMode: BlockadeMode;
  readonly rulesetId: string;
}
```
There is a `quickSettings()` helper (`createMatch.ts:196-228`) used by tests/sim that is a good template for what a Phase-1-hardcoded `buildMatchConfig()` should produce (same field set, different values per D-01/D-02/D-03/D-04).

### `apps/party/src/match/handlers/orders.ts` (controller, request-response/CRUD)

**Analog:** `packages/engine/src/submitOrder.ts` — this is not something to imitate, it's the function this handler directly calls. Copy its **error-handling contract**, not its internals: never throw for a rule violation, always return a typed result.

**Error handling pattern** (`packages/engine/src/submitOrder.ts:36-42, 89-91`):
```ts
const reject = (code: OrderRejection['code'], message: string): SubmitResult => ({
  state,
  rejection: { agentId: order.agentId, code, message },
});
// ...
const next: GameState = { ...state, pendingOrders: { ...state.pendingOrders, [order.agentId as string]: order } };
return { state: next, rejection: null };
```
The room handler's own response to the client (an ack/reject per RESEARCH.md Pitfall 2/2b) should mirror this same discriminated-result shape — `{ accepted: true }` or `{ accepted: false, rejection }` — never an optimistic ack before `submitOrder()` returns.

**Per-connection fog projection after resolution** (RESEARCH.md Pattern 2, built from `projectView`'s real signature):
```ts
// apps/party/src/match/handlers/orders.ts (illustrative — after resolveRound())
for (const conn of room.getConnections()) {
  const playerId = room.connectionPlayerId(conn);
  if (!playerId) continue;
  const view = projectView(state, playerId); // @berlin/engine — the ONLY sanctioned boundary
  conn.send(JSON.stringify({ type: 'ROUND_RESOLVED', view, log: view.lastRound }));
}
```

**`submitOrder()`'s full signature to call correctly** (`packages/engine/src/submitOrder.ts:31-35`):
```ts
export function submitOrder(state: GameState, player: PlayerId, order: AgentOrder): SubmitResult
// SubmitResult = { readonly state: GameState; readonly rejection: OrderRejection | null }
```
Note the ordering-before-picking-actions gotcha documented in `packages/engine/CLAUDE.md`: use `viewForOrdering(state, player, agentId)`, never `projectView`, when a client (predictively) or the room (authoritatively) needs to compute what's legal for a *second* agent — the two agents share one Intel pool.

### `apps/party/src/match/botRunner.ts` (service, event-driven)

**Analog:** `packages/ai/src/agent.ts` — the sole entry point bots go through.

Bots must receive `PlayerView`, never `GameState` — enforced by the type system per `apps/party/CLAUDE.md` rule 5 ("Bots get `projectView` output, same as humans. Never hand an `AIAgent` the `GameState` — the types forbid it, and that's deliberate.") Per RESEARCH.md Pitfall 6, decouple *deciding* (call `AIAgent.decide()` immediately, it's fast) from *submitting* (delay 1.5-4s via the room's own alarm before calling the identical `submitOrder()` path humans use — no bot fast path).

### `apps/web/components/resolution/StepThrough.tsx` (component, streaming/click-paced reveal)

**Analog:** RESEARCH.md's own Code Example, already written against this codebase's verified `PlayerView.lastRound` type (`packages/shared/src/view.ts:122`) and the engine's fixed 11-step order (`packages/engine/src/resolution/index.ts:39-49`).

**Core pattern:**
```tsx
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
      {!done && <button onClick={() => setRevealed((n) => n + 1)}>Next</button>}
    </div>
  );
}
```
Critical constraint: the server has already fog-filtered every event via `projectView()`/`filterEvents.ts` before it reaches this component. This component's *only* job is pacing (D-05: never reveal event N+1 before the player acknowledges event N) — it must never reorder, filter, or batch the array. D-06's slide/fade transition (Motion) attaches per-row on reveal, not on mount of the whole list.

### `apps/web/components/board/Board.tsx` (component, transform/render)

**Analog:** `packages/engine/src/content/maps/duel12.ts` — the data shape, not code to imitate.

**Data shape to render against** (verified, `packages/engine/src/content/maps/duel12.ts:22-35, 73-86`):
```ts
// Each node: { id: NodeId, name: string, sector: Sector, x: number, y: number,
//              edges: {to: NodeId, type: EdgeType}[], isUBahnStation: boolean,
//              extractionFor: Sector | null, hasInformant: boolean }
// x/y are PERCENTAGES (0-100) — already designed for a responsive SVG viewBox.
// e.g. { id: 'kurfurstendamm', name: 'Kurfürstendamm', sector: 'BLUE', x: 10, y: 45 }
```
`EdgeType` is `'STREET' | 'TUNNEL' | 'CHECKPOINT'` (`packages/shared/src/enums.ts:17`) — style solid/dashed/double-line per `docs/GAME_DESIGN.md` §3.1. Per `apps/web/CLAUDE.md` rule 3 ("Board rendering is data-driven... Adding a map must never require editing a component"), the component must read node/edge data generically — no `if (mapId === 'duel-12')` branching.

### `apps/web/components/board/OrderComposer.tsx` (component, request-response)

**Analog:** `packages/shared/src/orders.ts` (`Action` union) + `packages/engine/src/legalOrders.ts` (drives affordances, imported client-side for prediction only per `apps/web/CLAUDE.md` rule 2).

**The union the composer's affordances enumerate against** (`packages/shared/src/orders.ts:1-29`):
```ts
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
Per `packages/engine/CLAUDE.md`: "`legalOrders` stops offering MOVE/SPRINT once an operation is in the prefix... strikes and bribes resolve from the post-movement node." The composer must enforce or reflect this ordering constraint (movement-then-operation), not present all nine action types uniformly at every step. Never hand-roll a second "what can this agent do" implementation — always call `legalOrders(view, agentId, prefix)` client-side, and always use `viewForOrdering`-equivalent Intel accounting when composing a second agent's order in the same round.

### `apps/web/lib/socket.ts` (utility, streaming)

**Analog:** `docs/ARCHITECTURE.md` §5 protocol table — the exact message shapes this wrapper must type against, both directions:

```
Client -> server: JOIN, SET_SETTINGS (host only), SET_SEAT (host only), SUBMIT_LOADOUT,
                  SUBMIT_ORDER { round, agentId, actions: [Action, Action] },
                  RETRACT_ORDER, REQUEST_PAUSE, ANSWER_PAUSE
Server -> client: VIEW { view: PlayerView }, ROUND_RESOLVED { log, view },
                  OPPONENT_COMMITTED { playerId, agentsCommitted, agentsTotal },
                  CLOCK { deadlineAt, paused, pausesRemaining }, PAUSE_REQUESTED, ERROR
```
Do not hand-roll reconnect/backoff — use `partysocket`'s `usePartySocket` React hook per RESEARCH.md's "Don't Hand-Roll" table. Note D-11 means this phase doesn't need reconnection *UX*, but must not fight the library's default reconnect behavior either.

### `apps/web/lib/store.ts` (store, event-driven)

**Analog:** `apps/web/CLAUDE.md` rule 1 and rule 5, quoted verbatim as the pattern (no code exists yet):

> "The client holds a `PlayerView`, never a `GameState`." ... "Zustand holds session and UI state only — the selected agent, the two pending action slots, hover target, replay scrub position. Game state comes from the server; don't mirror it."

Store shape: `{ view: PlayerView | null, roomSnapshot: <lobby RoomState> | null, selectedAgentId, pendingActions: [Action?, Action?], hoverNodeId, resolutionRevealCount, ... }` — never a second copy of `GameState`.

## Shared Patterns

### Fog-of-war boundary (applies to every file in `apps/party` and every `apps/web` component that touches match data)
**Source:** `packages/shared/src/view.ts` (`PlayerView`, `OpponentPublicInfo`), `packages/engine/src/fog/projectView.ts`
**Apply to:** `MatchRoom.ts`, `handlers/orders.ts`, `botRunner.ts`, `Board.tsx`, `OrderComposer.tsx`, `StepThrough.tsx`, `store.ts`
```ts
// The ONLY sanctioned path from GameState to a client-bound payload:
const view = projectView(state, viewer); // per-connection, never once for a broadcast()
```
Rule, quoted from `apps/party/CLAUDE.md`: "`projectView` is the only send path. Every outbound message is built from a `PlayerView`. If a code path serializes anything else toward a client, it's a bug." And from `packages/engine/src/fog/CLAUDE.md`: "Build views by construction, not by deletion." Four hidden categories to never leak: agent positions, safehouse, active traps, cooldown timers.

### Zod validation at the wire boundary
**Source:** `packages/shared/src/orders.ts` (`Action` discriminated union — the shape Zod schemas must mirror); no `protocol.ts` exists yet in `packages/shared/src/` despite being an "expected file" per `packages/shared/src/CLAUDE.md` — **this phase is the first to create it.**
**Apply to:** Every inbound PartyKit message handler (`SET_SEAT`, `SUBMIT_ORDER`, `RETRACT_ORDER`, etc.)
Rule, quoted from `apps/party/CLAUDE.md`: "Validate every inbound message with Zod before it reaches the engine. Clients are untrusted, including your own. Host-only messages are checked against the seat, not the payload." Per `packages/shared/src/CLAUDE.md`: "Zod schemas are the source of truth for wire types; derive TS types with `z.infer`, don't hand-write both."

### Error handling — return typed results, never throw for rule violations
**Source:** `packages/engine/src/submitOrder.ts:36-42` (the `reject()` closure pattern)
**Apply to:** All `apps/party` message handlers, and the "server ack, not optimistic local flag" UI pattern in `apps/web/components/board/OrderComposer.tsx` (RESEARCH.md Pitfall 2/2b)
```ts
const reject = (code: OrderRejection['code'], message: string): SubmitResult =>
  ({ state, rejection: { agentId: order.agentId, code, message } });
```
Root `CLAUDE.md` states this as a repo-wide rule: "No exceptions for rule violations — `submitOrder()` returns a `SubmitResult` with rejection details, never throws."

### Server-authoritative clock
**Source:** `docs/ARCHITECTURE.md` §5 design notes; `apps/web/CLAUDE.md` rule 6
**Apply to:** `apps/party/src/match/clock.ts`, `apps/web/lib/store.ts`, any component rendering the countdown
Rule, quoted from `apps/web/CLAUDE.md`: "The clock is server-authoritative. Render from the `CLOCK` message's `deadlineAt`, never from a local countdown that drifts." D-04 changes the *value* (90s, not 60s) but not the mechanism — Durable Object alarms, auto-Hold on expiry (`packages/engine/src/submitOrder.ts:107-122`, `autoHoldMissing()`).

### Bot decision boundary
**Source:** `packages/ai/src/agent.ts` (not read in full this pass — signature confirmed via `packages/ai/CLAUDE.md`-equivalent references in RESEARCH.md and root `CLAUDE.md` rule 4: "Bots don't cheat. An `AIAgent` receives `PlayerView` and nothing else.")
**Apply to:** `apps/party/src/match/botRunner.ts`
Bots go through the exact same `submitOrder()` path as humans, submitted after a randomized 1.5-4s delay (RESEARCH.md Pitfall 6), decoupling fast `decide()` from deliberately slow `submit()`.

## No Analog Found

Files with no close match in the codebase (planner should rely on RESEARCH.md's Code Examples / UI-SPEC.md directly, since no prior implementation or convention exists for these):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/web/app/page.tsx` (home) | route/component | request-response | No home-page precedent anywhere in repo; build directly from `01-UI-SPEC.md`'s Screens/Copywriting tables |
| `apps/web/lib/identity.ts` (codename gen + localStorage) | utility | CRUD (file/storage I/O) | D-09 is a wholly new mechanism (no login system, no prior local-identity code exists) — build from CONTEXT.md D-09 description directly; `nanoid`'s `customAlphabet` (already used for join codes) is the only reusable primitive |
| `apps/web/lib/formatting.ts` | utility | transform | Generic formatting helpers (truncate codename at 20 chars per UI-SPEC overflow row, format `deadlineAt` as mm:ss) — no existing formatting utility in the repo to copy |
| `apps/party/src/match/clock.ts` (alarm-driven round timer) | service | event-driven | No prior PartyKit alarm code exists; build directly from `docs/ARCHITECTURE.md` §5's clock design notes and PartyKit's own alarm API (external library docs, not in-repo) |

## Metadata

**Analog search scope:** `packages/shared/src/`, `packages/engine/src/` (incl. `fog/`, `resolution/`, `content/`), `packages/ai/src/agent.ts`, `apps/web/CLAUDE.md`, `apps/party/CLAUDE.md`, `packages/*/CLAUDE.md`, `docs/ARCHITECTURE.md` §5, phase RESEARCH.md/CONTEXT.md/UI-SPEC.md
**Files scanned:** ~25 (all non-test, non-dist `.ts` files in `packages/*/src`, plus every `CLAUDE.md` in the dependency path, plus `docs/ARCHITECTURE.md` §5)
**Pattern extraction date:** 2026-08-19
**Note:** `packages/engine/tests/fog-leak.test.ts` was not directly read this pass (budget-constrained) — its existence and role as the pattern to extend to a wire-level test is confirmed by both CONTEXT.md's canonical_refs and RESEARCH.md Pitfall 1's explicit citation. The planner/executor building the wire-level fog test should read that file directly before writing the new `apps/party` equivalent.
