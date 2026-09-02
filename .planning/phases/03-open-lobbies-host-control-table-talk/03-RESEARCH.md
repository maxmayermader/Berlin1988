# Phase 3: Open Lobbies, Host Control & Table Talk - Research

**Researched:** 2026-08-31
**Domain:** PartyKit (Cloudflare Durable Objects) room-server transport/state-machine work + Next.js client UI. No new packages, no engine changes.
**Confidence:** HIGH for in-repo architecture (all claims read from source this session); MEDIUM for PartyKit platform behavior (official docs, not independently load-tested); LOW/ASSUMED for a few externally-sourced platform edge cases flagged below.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Public Lobby Discovery**
- D-01: A single well-known "directory" PartyKit room (e.g. `lobby-directory`) that every match room registers/unregisters itself with. Home page connects to it (WebSocket) for a live open-lobbies list. — Reversibility: costly.
- D-02: Public list metadata per lobby: seat count as "X/Y filled" and host codename. No ready count shown in the list.
- D-03: A lobby is removed from the public list the moment its `RoomPhase` leaves `LOBBY`/`LOADOUT` and enters `IN_GAME`.

**Host Seat-Count & Kick Control**
- D-04: Host can set seat count freely across 1–4 before the match starts, via a lobby control.
- D-05: Lowering seat count below the number of currently-occupied seats is blocked client- and server-side — disabled/greyed, never auto-kicking.
- D-06: A kicked player's client receives a `KICKED` message, redirects home with a toast, and can rejoin later with the same join code — no per-room ban/kick-list this phase.

**Disconnect, AI Takeover & Bot Readout**
- D-07: Disconnect is detected via PartyKit's `onClose`. A grace-period timer starts on close (duration is planner/implementer's choice, in the spirit of Phase 1 D-04/COUNTDOWN_DURATION_MS). Reconnect before expiry silently reclaims the seat, no takeover. Expiry triggers AI takeover mid-match.
- D-08: AI takeover is **not permanent** — a human reconnecting later (even post-grace, even post-takeover) hands the seat back from AI to human via their token. Diverges from Phase 1 D-11 ("no reconnection handling") and from `fillEmptySeatsWithBots`'s current LOBBY-only, one-way semantics. The resolution/orders pipeline must tolerate a seat's control flipping human↔AI mid-match without double-submitting or conflicting orders for the current round.
- D-09: Bot seat readout is `"[Personality name] the [Title]"` (e.g. "Katja Reiner the Ghost"), not a bare id/difficulty label.

**Chat**
- D-10: Lobby chat and in-match chat are separate logs — lobby chat clears at match start.
- D-11: Chat messages attributed to codename only, never agent/seat identity.
- D-12: ~8-10 curated flavor prompts, Cold War themed, drafted by Claude during implementation, in both lobby and in-match chat.

### Claude's Discretion
- Grace-period timer duration for D-07 — no source artifact specifies one.
- Exact wording/placement of the kicked-player toast (D-06).
- Exact 8-10 flavor prompt lines (D-12) and whether lobby vs. match get identical or slightly different sets.
- Whether the directory room (D-01) needs dedup/failure-recovery logic beyond straightforward register/unregister calls.

### Deferred Ideas (OUT OF SCOPE)
- Per-room kick/ban list (D-06 deliberately allows rejoin with code).
- Platform room-listing API or DB-backed lobby registry as an alternative to D-01's directory room.
- Continuous single chat log spanning lobby→match (rejected in favor of D-10).
- Anonymous/seat-number-only chat attribution (rejected in favor of D-11).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-03 | Browse a public list of open lobbies, join with a click | Directory-room pattern (§ Architecture Patterns, Pattern 1); new home-page route/component; `lobbySnapshotSchema`-style public metadata schema for the directory list |
| LOBBY-01 | Host can toggle seat count before start | `SEAT_COUNT` constant removal in `apps/party/src/state.ts:23`; new `SET_SEAT_COUNT` message on the existing request/ack/reject triad pattern (Phase 2's `SUBMIT_LOADOUT`/`LOADOUT_ACK`/`LOADOUT_REJECTED`) |
| LOBBY-02 | Host can kick a player | New `KICK` message, host-seat verification pattern (`apps/party/src/CLAUDE.md` rule 5), `KICKED` terminal message to the target connection |
| LOBBY-06 | Kicked/disconnected seat filled by AI, match continues | Extends `fillEmptySeatsWithBots` (LOBBY-only, one-way) with a new mid-match takeover path; `onClose` + grace-period alarm (§ Common Pitfalls, Pitfall 1–3) |
| LOBBY-07 | AI seat shows bot name + personality, not difficulty | `Personality.title` **already exists in code** (§ Common Pitfalls, Pitfall 4 — corrects a CONTEXT.md premise) — only wiring to `lobbySeatSchema`/`toSnapshot()` is new |
| CHAT-01 | Free-text chat in lobby | New `CHAT_SEND`/`CHAT_MESSAGE` wire messages, server-side room-scoped chat log (not persisted beyond the room's own storage) |
| CHAT-02 | Free-text chat in match | Same wire messages, `RoomPhase`-scoped log per D-10 |
| CHAT-03 | Predefined flavor prompts | Same `CHAT_SEND` message with a `kind: 'FREE' \| 'PROMPT'` discriminant, or a fixed `promptId` field validated server-side against a shared prompt list in `packages/shared` |
</phase_requirements>

## Summary

This phase is pure transport/room-state/UI work on top of an already-solid PartyKit + Next.js skeleton — no engine, AI, or shared-rules changes. Three of D-07/D-08/D-09's stated premises turned out, on reading the actual source this session, to need correction or sharpening:

1. **`Personality.title` already exists in code** (`packages/ai/src/personalities/index.ts:32`, populated for all five personalities, e.g. `title: 'The Ghost'` for KATJA). CONTEXT.md's claim that the personalities module "only has id/name" is stale — no new field needs adding to `@berlin/ai`. The only real work for D-09 is plumbing `personality`/`title` from the already-existing server-only `RoomSeat.personality` field through a new public field on `lobbySeatSchema`/`toSnapshot()`.
2. **A verified engine-level pitfall makes D-08's double-submit warning concrete, not hypothetical.** `submitOrder()` in `packages/engine/src/submitOrder.ts:86-90` has no "already committed" rejection code — a second `submitOrder()` call for the same agent this round **silently overwrites** `pendingOrders[agentId]`, no error, no signal. A bot's already-decided, still-pending `BotSubmission` for a seat that gets reclaimed mid-round *will* clobber the reclaiming human's fresh order if its `releaseAt` lands after the human's `SUBMIT_ORDER` — this is an ordering race the room layer, not the engine, must close (purge queued `BotSubmission`s for a seat the instant it's reclaimed).
3. **PartySocket already auto-reconnects and already re-sends `JOIN` with the stored token on `onOpen`.** The existing token-rebind path in `handleJoin()` (`apps/party/src/handlers.ts:98-167`) is very close to being D-08's reclaim mechanism already — it has no phase guard, so it already fires during `IN_GAME`. The gap is that it only *rebinds a connection*, not *flips seat control back from AI to human* — `RoomSeat` currently has no field distinguishing "this HUMAN seat is temporarily AI-piloted" from "this is permanently a BOT seat," which D-08 needs and does not yet exist.

For the directory room (D-01), PartyKit's documented multi-party pattern (`this.room.context.parties.<partyName>.get(<roomId>).fetch(...)`) is exactly the "occupancy tracker singleton room" shape PartyKit's own docs use as a worked example — this is a first-class supported pattern, not a workaround, and requires one new `parties` entry in `partykit.json` plus one new room class.

**Primary recommendation:** Add a second PartyKit party (`directory`) with one well-known room id; have `MatchRoom` push register/update/unregister events to it via `room.context.parties.directory.get('lobby-directory').fetch(...)` at the same lifecycle points it already persists state (create, every `sendLobby`, `startMatch`, and match end); expose `PERSONALITY.title` through a new public `LobbySeat` field; add a `controlledBy: 'HUMAN' | 'AI'` (or similarly named) field to `RoomSeat`/seat wire type, orthogonal to `kind`, to represent a live, reversible control flip; and purge any queued `BotSubmission` for a seat synchronously at the moment of reclaim, before extending the grace-period alarm into the existing single-alarm-slot scheduling pattern already used for round deadlines and bot releases.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Open-lobby directory list | API / Backend (new `directory` PartyKit party) | Frontend (new home-page route) | Directory state (which rooms are open, their seat counts) is cross-room and must live in one authoritative room; the browser only renders what it's sent |
| Host seat-count control | API / Backend (`apps/party/src/state.ts`, `handlers.ts`) | Frontend (disable/grey control) | Server is authoritative for `SEAT_COUNT`; client-side disabling is UX-only, mirroring D-05's stated split |
| Host kick | API / Backend | Frontend (kick button, host-only visibility) | Same split — host-only enforcement must be verified against the seat that owns the room, never a client flag (existing rule in `apps/party/CLAUDE.md`) |
| Disconnect detection & grace timer | API / Backend (`onClose`, Durable Object alarm) | — | `onClose`/alarms are server-only concepts; no client involvement beyond auto-reconnect (already provided by `partysocket`) |
| AI takeover / reclaim | API / Backend (`bots.ts`, `state.ts`) | — | Seat control mode is authoritative room state; a leaked or client-guessed control mode would be a fog/trust violation of the same class the existing `apps/party/src/CLAUDE.md` rules already guard against |
| Bot personality/title readout | API / Backend (expose field in snapshot) | Frontend (render "X the Y") | Personality/title is *not* hidden state (unlike positions/safehouse/traps) — safe to add to the already-public `LobbySeat`/`toSnapshot()` path |
| Chat (lobby + match) | API / Backend (room-scoped log, broadcast) | Frontend (chat panel, input) | Chat messages must be attributed server-side to the connection's bound seat's codename (same `seatFor(connectionId)` pattern as every other message), never a client-supplied identity field, per D-11 |

## Standard Stack

### Core
No new libraries. This phase is built entirely on packages already in the repo:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `partykit` | 0.0.115 [VERIFIED: apps/party/package.json:14] | Room server / Durable Object framework, now extended to a second `directory` party | Already the project's chosen realtime host (`docs/ARCHITECTURE.md` §1) |
| `partysocket` | 1.3.0 [VERIFIED: apps/web/package.json:17] | Client WebSocket wrapper with built-in auto-reconnect [CITED: docs.partykit.io/reference/partysocket-api] | Already used for the existing lobby/match socket (`apps/web/lib/socket.ts`) |
| `zod` | 4.4.3 [VERIFIED: apps/party/package.json:19] | Wire-schema validation for new message types | Already the sole validation library at the wire boundary (`packages/shared/src/protocol.ts`) |
| `zustand` | (already a web dependency, version not re-verified this session — unchanged from Phase 1/2) | New chat/lobby-list client stores | Established pattern (`matchStore.ts`, `uiStore.ts`, `loadoutStore.ts`) |

### Supporting
No new supporting libraries required. Do not add a rate-limiting library, a moderation library, or a pub/sub library — see Don't Hand-Roll below for why the existing primitives suffice.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A single `directory` PartyKit room (D-01, locked) | A platform room-listing API, or a DB-backed registry (Neon Postgres, arriving Phase 6+) | Explicitly deferred per CONTEXT.md — Postgres isn't provisioned until Phase 6, and PartyKit has no built-in "list all rooms" API today; the directory-room pattern is documented as PartyKit's own recommended workaround for this exact gap |
| A new `RECLAIM_SEAT` wire message for D-08 | Extending the existing token-bearing `JOIN` message's already-unconditional (no phase guard) rebind path | Recommended: `JOIN` already fires during `IN_GAME` via the client's stored token and `usePartySocket`'s auto-reconnect `onOpen` handler — a second message type would duplicate logic that already runs. The new work is entirely in what `handleJoin`'s token-rebind branch does when the found seat is currently AI-controlled, not in adding a new message. |

**Installation:** None — no `npm install` needed for this phase.

**Version verification:** `partykit@0.0.115`, `partysocket@1.3.0`, `zod@4.4.3` confirmed directly from `apps/party/package.json` and `apps/web/package.json` in this repo — no registry lookup needed since these are already-installed, already-pinned dependencies, not new additions.

## Package Legitimacy Audit

No new external packages are introduced by this phase. All work is built on already-installed, already-verified dependencies (`partykit`, `partysocket`, `zod`, `zustand`) plus in-repo code changes. The Package Legitimacy Gate does not apply.

**Packages removed due to [SLOP] verdict:** none — no new packages evaluated.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │  BROWSER — Home page (new)               │
                         │  connects via WebSocket to the           │
                         │  `directory` party, room id               │
                         │  "lobby-directory"                        │
                         └───────────────┬───────────────────────────┘
                                         │ WebSocket (read-only list stream)
                                         ▼
        ┌──────────────────────────────────────────────────────────┐
        │  DIRECTORY PARTY (new apps/party/src/directory.ts)         │
        │  One Durable Object, well-known room id "lobby-directory"  │
        │  Holds: Record<matchCode, { seats: "X/Y", hostCodename }>  │
        │  Broadcasts DIRECTORY_STATE to every connected home page   │
        └───────────────▲──────────────────────────────────────────┘
                         │ this.room.context.parties.directory
                         │   .get('lobby-directory').fetch(...)
                         │ REGISTER / UPDATE / UNREGISTER
                         │
        ┌────────────────┴─────────────────────────────────────────┐
        │  MATCH ROOM (existing apps/party/src/room.ts)              │
        │  On CREATE / every seat-affecting mutation / startMatch /  │
        │  match end → pushes directory events at the same points    │
        │  it already calls persist() + sendLobby()                  │
        │                                                            │
        │  New: SET_SEAT_COUNT, KICK, KICKED, CHAT_SEND,             │
        │       CHAT_MESSAGE handlers alongside existing              │
        │       CREATE/JOIN/SET_READY/SET_CODENAME/SUBMIT_LOADOUT/    │
        │       SUBMIT_ORDER                                          │
        │                                                            │
        │  onClose(connection) → starts a per-seat grace-period       │
        │  timer, folded into the existing single-alarm-slot          │
        │  scheduling (apps/party/src/room.ts syncAlarm/               │
        │  roundAlarmTarget already takes the MIN of several          │
        │  candidate targets — grace-period expiry becomes one more)  │
        │                                                            │
        │  Grace expiry → takeOverSeat() (new, distinct from          │
        │  fillEmptySeatsWithBots which is LOBBY-only/one-way)        │
        │  sets RoomSeat.controlledBy = 'AI', assigns personality      │
        │                                                            │
        │  JOIN w/ matching token, seat.controlledBy === 'AI'  →      │
        │  reclaimSeat() flips controlledBy back to 'HUMAN',          │
        │  PURGES any queued BotSubmission for that playerId          │
        │  before it can releaseAt-fire and clobber the human's       │
        │  fresh SUBMIT_ORDER (packages/engine/src/submitOrder.ts     │
        │  silently overwrites pendingOrders[agentId] — no             │
        │  "already committed" rejection exists)                      │
        └────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
apps/party/src/
├── directory.ts        # NEW — the directory PartyKit Server class (2nd party)
├── directoryClient.ts  # NEW — helper the match room calls to register/update/unregister
├── state.ts             # SEAT_COUNT const removed; setSeatCount(), RoomSeat.controlledBy added
├── handlers.ts           # + handleSetSeatCount, handleKick, handleChatSend, reclaim branch in handleJoin
├── bots.ts               # + takeOverSeat() (mid-match, reversible) alongside fillEmptySeatsWithBots (LOBBY-only, unchanged)
├── timers.ts             # + grace-period scheduling helper, same shape as scheduleRoundDeadline
├── chat.ts               # NEW — chat log storage + FLAVOR_PROMPTS constant (or lives in packages/shared)
└── room.ts               # wires new handlers, folds grace-period target into roundAlarmTarget/syncAlarm

apps/web/app/
├── page.tsx              # + open-lobby list (reads directory party)
├── lobby/[code]/page.tsx # + seat-count control, kick buttons, chat panel
└── match/[code]/page.tsx # + chat panel

apps/web/lib/
├── directorySocket.ts    # NEW — connects to the directory party, mirrors socket.ts's pattern
├── chatStore.ts          # NEW — Zustand store, lobby vs match logs kept separate per D-10
└── socket.ts             # + CHAT_MESSAGE/KICKED/DIRECTORY_STATE dispatch (existing onMessage switch)

packages/shared/src/
└── protocol.ts            # + SET_SEAT_COUNT, KICK, KICKED, CHAT_SEND, CHAT_MESSAGE, DIRECTORY_STATE schemas
```

### Pattern 1: Directory-room registration (D-01)

**What:** A second PartyKit party (a distinct Durable Object class, declared in `partykit.json`'s `parties` map) acting as a singleton registry that every match room's Durable Object pushes updates to via `room.context.parties`.

**When to use:** Any time PartyKit rooms need to discover each other's existence — the platform provides no built-in "list all active rooms" API.

**Example (from PartyKit's own documented pattern for cross-party room-occupancy tracking):**
```typescript
// Source: docs.partykit.io/guides/using-multiple-parties-per-project/ [CITED]
// A room accesses another party by the name declared in partykit.json,
// gets a specific room instance by id, and fetches it like an HTTP resource.
const directoryParty = this.room.context.parties.directory;
const directoryRoom = directoryParty.get('lobby-directory');
await directoryRoom.fetch({
  method: 'POST',
  body: JSON.stringify({ type: 'REGISTER', code: this.room.id, seats: '1/4', host: 'Iron Falcon' }),
});
```
`partykit.json` needs a second entry in its `parties` map (currently only `"match": "src/room.ts"` [VERIFIED: /Users/maxmay/Documents/GitHub/Berlin1988/apps/party/partykit.json, quoted below]):
```json
{
  "parties": {
    "match": "src/room.ts",
    "directory": "src/directory.ts"
  }
}
```
Verbatim current `partykit.json` content read this session:
```json
{
  "$schema": "https://www.partykit.io/schema.json",
  "name": "berlin1988-party",
  "main": "src/room.ts",
  "compatibilityDate": "2024-01-01",
  "parties": {
    "match": "src/room.ts"
  }
}
```

**Caveat [CITED: docs.partykit.io/guides/using-multiple-parties-per-project]:** `room.context.parties` is *not* available inside `onAlarm` handlers — a documented workaround is to fetch the other party's public URL directly (`https://<project>.<user>.partykit.dev/parties/<partyName>/<roomId>`) from inside an alarm callback if a directory update must originate from `onAlarm` rather than `onMessage`/`onRequest`. This matters because `startMatch()` (D-03's "leaves the list the moment `IN_GAME` starts") is invoked from `onAlarm` in the current code (`apps/party/src/room.ts:199-217`) — the unregister-from-directory call at match start must either use the raw-fetch workaround, or be moved to fire from the calling context around `onAlarm` rather than from deep inside a pure state-transition function.

### Pattern 2: Mid-match reversible seat control (D-08)

**What:** A `RoomSeat` field that records who currently controls the seat, orthogonal to `kind` (which should keep meaning "was this seat originally a human join or a lobby-fill bot", not "who's driving it right now").

**Why the split matters:** The existing `fillEmptySeatsWithBots` (`apps/party/src/bots.ts:38-53`) only ever touches seats where `seat.playerId === null` (i.e. never-joined `OPEN` seats) and assigns them a synthetic `playerId` like `bot-${index}-${personality}`. A disconnected *human* seat being taken over mid-match is a fundamentally different case: its `playerId`, `token`, and `codename` must be preserved unchanged (so a later reclaim by the same token works), while only the seat's *decision source* flips to AI for the interim. Overloading `kind: 'BOT'` for this case would either destroy the seat's real `playerId`/`token` (breaking reclaim) or require every `kind === 'BOT'` check in the codebase (`fillEmptySeatsWithBots`'s own occupied-seat skip, `decideForBotSeats`'s bot-agent loop, `seatRows.ts`'s `isAi` flag) to be re-audited for whether it means "originally-a-bot" or "currently-AI-piloted" — a distinction that doesn't exist in the type today.

**Recommended shape:**
```typescript
// apps/party/src/state.ts — extending RoomSeat
export interface RoomSeat extends LobbySeat {
  // ...existing fields unchanged...
  /** Who is currently deciding this seat's orders. Distinct from `kind`:
   *  `kind` records whether the seat originated as a human join or a
   *  lobby-fill bot; `controlledBy` records the live, reversible D-08
   *  control mode. A HUMAN-kind seat can have controlledBy: 'AI' after a
   *  grace-period expiry, and back to 'HUMAN' after a token-matched
   *  reclaim — kind never changes in either transition. */
  controlledBy: 'HUMAN' | 'AI' | null; // null for OPEN seats and pre-match seats
}
```
`decideForBotSeats` (`apps/party/src/bots.ts:71-100`) would then loop over seats where `seat.controlledBy === 'AI'` (true for both original BOT-kind seats and AI-takeover HUMAN-kind seats) rather than `seat.kind !== 'BOT'`.

### Pattern 3: Purging in-flight bot orders on reclaim (D-08)

**What:** The moment a seat's control flips from AI back to HUMAN, any `BotSubmission` already queued in `state.botSubmissions` for that `playerId` for the *current* round must be removed before its `releaseAt` timestamp passes.

**Why this is necessary, not optional (verified this session):**
```typescript
// Source: packages/engine/src/submitOrder.ts:86-90 — read this session, quoted verbatim
const next: GameState = {
  ...state,
  pendingOrders: { ...state.pendingOrders, [order.agentId as string]: order },
};
return { state: next, rejection: null };
```
There is no check anywhere in `submitOrder()` for "this agent already has a pending order this round" — the rejection-code union is `['NOT_YOUR_AGENT', 'AGENT_DEAD', 'TOO_MANY_ACTIONS', 'ILLEGAL_ACTION', 'CARD_NOT_IN_LOADOUT', 'CARD_ON_COOLDOWN', 'INSUFFICIENT_INTEL', 'WRONG_PHASE']` [VERIFIED: packages/shared/src/protocol.ts:120-129, quoted here verbatim] — none of these mean "already submitted." A second `submitOrder()` call for the same `agentId` silently overwrites the first. `releaseBotSubmissions` (`apps/party/src/bots.ts:112-146`) calls `submitOrder()` through the exact same path a human's `SUBMIT_ORDER` uses. If a human reclaims a seat and submits a real order, and a stale `BotSubmission` for that same seat's agent is still sitting in `state.botSubmissions` with a `releaseAt` that hasn't passed yet, the room's next alarm tick will silently replace the human's real order with the bot's stale decision — with no error, no rejection, and nothing in the wire protocol to detect it client-side.

**Fix:** `reclaimSeat()` must filter `state.botSubmissions` to drop every entry whose `playerId` matches the reclaiming seat, as an atomic part of the same state transition that flips `controlledBy` back to `'HUMAN'` — mirroring how `releaseBotSubmissions` already filters `state.botSubmissions` by `releaseAt`.

### Pattern 4: Grace-period timer folded into the existing single-alarm pattern (D-07)

**What:** Cloudflare Durable Objects support exactly one scheduled alarm at a time [CITED: developers.cloudflare.com/durable-objects/api/alarms — "each Durable Object is able to schedule a single alarm at a time"], and this codebase already handles that constraint by taking the `Math.min()` of multiple candidate deadlines:
```typescript
// Source: apps/party/src/room.ts:307-312 — read this session, quoted verbatim
private roundAlarmTarget(state: RoomState): number | null {
  const targets: number[] = [];
  if (state.deadlineAt !== null) targets.push(state.deadlineAt);
  for (const submission of state.botSubmissions) targets.push(submission.releaseAt);
  return targets.length > 0 ? Math.min(...targets) : null;
}
```
**Recommendation:** Store per-seat grace-period expiry timestamps in `RoomState` (e.g. `disconnectedSeats: { seatIndex: number; graceExpiresAt: number }[]`, mirroring the `BotSubmission` shape) and add those timestamps into `roundAlarmTarget`'s `targets` array alongside `deadlineAt` and bot `releaseAt`s. This is a direct extension of an already-proven pattern, not new architecture. It also means grace-period expiry survives Durable Object hibernation for free — [CITED: developers.cloudflare.com/durable-objects/api/alarms] "alarms survive hibernation and eviction... if a Durable Object hibernates between alarm fires, the alarm itself wakes the DO."

### Anti-Patterns to Avoid
- **Building a new `setInterval`/`setTimeout` for the grace-period timer:** in-memory timers do not survive Durable Object hibernation [CITED: docs.partykit.io/guides/scaling-partykit-servers-with-hibernation — "Attaching event handlers manually in `onConnect` will not work because as soon as the party hibernates, these handlers are lost"]. Every timer in this codebase already goes through `room.storage.setAlarm()` (D-07's own CONTEXT.md note explicitly calls this out by referencing `COUNTDOWN_DURATION_MS`'s pattern) — the grace-period timer must follow the same discipline.
- **Sending chat messages with a client-supplied identity/codename field:** every existing handler resolves the acting seat via `seatFor(state, connectionId)` and never trusts an identity field in the message body (`apps/party/src/CLAUDE.md` rule 2, restated in `handlers.ts`'s own comments at lines 169-179 and 300-309). `CHAT_SEND` must follow the identical pattern — the message carries only `{ text }` or `{ promptId }`, never a codename.
- **Reusing `kind: 'BOT'` to represent a live AI takeover of a human seat:** see Pattern 2 above — this destroys the seat's original identity and breaks reclaim.
- **Treating the directory room as authoritative for anything beyond list metadata:** the directory room must never receive or store anything beyond what D-02 specifies (seat count, host codename) — it must not become a second source of truth for lobby state, which stays owned by each match room.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-room discovery | A custom polling mechanism where the home page repeatedly HTTP-GETs every possible room id | The directory-room WebSocket broadcast pattern (D-01, Pattern 1) | PartyKit's own docs demonstrate this exact pattern for "room switcher with live occupancy counts" — it's push-based and idiomatic, not a workaround |
| Reconnect/backoff logic on the client | A custom retry loop around the WebSocket | `partysocket`'s built-in reconnection (`maxReconnectionDelay`, `minReconnectionDelay`, `reconnectionDelayGrowFactor`, `maxRetries` config options) [CITED: docs.partykit.io/reference/partysocket-api] | Already in use via `usePartySocket` (`apps/web/lib/socket.ts:101-171`); a second reconnect implementation would race the first |
| Grace-period / disconnect timers | `setTimeout`/`setInterval` in the room instance | `room.storage.setAlarm()` folded into the existing `roundAlarmTarget` min-of-targets pattern (Pattern 4) | In-memory timers are lost on hibernation; this is an established, repo-proven pattern already |
| Chat moderation / profanity filtering | A moderation service integration or word-filter library | D-06's host-kick + D-12's curated-prompt-only-for-strangers design (explicitly, per REQUIREMENTS.md's Out of Scope table: "Free-text chat with no moderation backstop... predefined flavor prompts + host-kick are the v1 moderation strategy") | Locked project decision — building a moderation pipeline this phase would be scope creep beyond what REQUIREMENTS.md commits to |
| Seat-count validation | Ad hoc inline checks scattered across handler and UI | A single `canSetSeatCount(state, newCount): boolean` pure function in `state.ts`, called from both the server handler (authoritative) and the client (to grey the control) — mirrors the existing `validateLoadout`/`loadoutLegality` split between engine-authoritative and client-preview | Matches the codebase's established "engine/state truth + UI preview" pattern (`apps/web/lib/loadoutStore.ts`, `02-02-PLAN.md`'s `loadoutLegality()`) |

**Key insight:** Every "don't hand-roll" item in this phase has a working precedent already in this exact codebase (bot-release alarm folding, engine-vs-preview validation split, Zod-validated seat-scoped messages). This phase is additive engineering on proven patterns, not new architecture — the risk is inconsistency with those patterns, not missing capability.

## Common Pitfalls

### Pitfall 1: Believing D-07's grace-period timer needs new infrastructure
**What goes wrong:** Implementing a bespoke timer/queue system for disconnect grace periods, duplicating what `botSubmissions`/`roundAlarmTarget` already do.
**Why it happens:** D-07's CONTEXT.md phrasing ("in the same spirit as... COUNTDOWN_DURATION_MS") reads like it wants a brand-new standalone timer.
**How to avoid:** Model grace-period entries exactly like `BotSubmission` (a `{ playerId, releaseAt }`-shaped array on `RoomState`, drained by the alarm handler, folded into `roundAlarmTarget`'s `Math.min()`).
**Warning signs:** A new `setInterval`, a second `storage.setAlarm()` call site, or any code path that doesn't route through the existing `syncAlarm()`/`onAlarm()` dispatcher in `room.ts`.

### Pitfall 2: The `submitOrder()` silent-overwrite race (D-08) — verified, not hypothetical
**What goes wrong:** A reclaimed human's fresh order is silently clobbered by a stale, already-queued bot decision for the same agent, with zero error signal anywhere in the stack.
**Why it happens:** `submitOrder()` (`packages/engine/src/submitOrder.ts:86-90`, quoted in Pattern 3 above) has no "already committed" rejection — this is engine behavior that predates this phase and is out of scope to change (engine changes aren't part of this phase's mandate), so the fix belongs entirely in the room layer.
**How to avoid:** `reclaimSeat()` must synchronously purge `state.botSubmissions` entries for the reclaimed `playerId` as part of the same state transition, before returning to the caller — never as a follow-up step that could itself race the alarm.
**Warning signs:** A reclaim implementation that flips `controlledBy` without touching `botSubmissions` at all.

### Pitfall 3: `onClose` not firing promptly (or firing with a delay) on an abrupt network drop
**What goes wrong:** D-07's grace period is measured from `onClose`, but Cloudflare's Hibernatable WebSockets API's close detection for an abrupt disconnect (network loss, laptop sleep without a clean close handshake) is a platform-level TCP/ping-pong timeout, not instantaneous [ASSUMED — training knowledge on WebSocket keep-alive semantics generally; not independently confirmed for this Cloudflare API version this session, see Assumptions Log]. A player whose WiFi drops may not have `onClose` fire for some additional delay beyond the grace period the planner picks, meaning the *effective* time before AI takeover can exceed the configured grace-period duration.
**Why it happens:** WebSocket close detection for non-clean disconnects fundamentally depends on transport-level timeouts, which are a platform behavior PartyKit's docs don't fully specify for `onClose` timing (confirmed by direct doc fetch this session — the hibernation guide's fetched content did not address this specific question).
**How to avoid:** Treat the grace-period duration as a lower bound on total reclaim window, not an exact bound; do not build any user-facing copy or logic that promises AI takeover fires at *precisely* `graceExpiresAt` for every disconnect type. This is a documentation/expectation-setting issue, not a blocking implementation problem.
**Warning signs:** UI copy or tests asserting an exact takeover timestamp for a simulated abrupt-drop scenario rather than an explicit `close` event.

### Pitfall 4: Assuming `Personality.title` needs to be added to `@berlin/ai` (D-09)
**What goes wrong:** Time spent adding a `title` field to `packages/ai/src/personalities/index.ts` that already exists.
**Why it happens:** CONTEXT.md's canonical-refs section states "`packages/ai/src/personalities/index.ts`... only has `id`/`name`" — this was true at an earlier point in the codebase's history but is stale as of this session's read.
**How to avoid:** Read `packages/ai/src/personalities/index.ts:29-41` before starting D-09 work — verified this session, the `Personality` interface already declares `readonly title: string;` and every one of the five exported personalities (`VOGEL`, `KATJA`, `MAREK`, `HALLORAN`, `SABLE`) already populates it (e.g. `title: 'The Ghost'` for KATJA at line 106). The only real work is: (1) exposing `PERSONALITIES[seat.personality].name` + `.title` (or a derived `"${name} the ${title}"` string) through a new public field on `lobbySeatSchema`/`toSnapshot()`, since `RoomSeat.personality`/`difficulty` are currently explicitly excluded from the wire (`apps/party/src/state.ts:40-44`, comment: "Server-only, never in toSnapshot() — LOBBY-07's AI name/personality readout is Phase 3 scope"); and (2) rendering it in `seatRows.ts`/`SeatList.tsx` instead of the current bare `isAi` boolean badge.
**Warning signs:** Any task description that says "add a title field to the personality data."

### Pitfall 5: Forgetting `room.context.parties` is unavailable inside `onAlarm`
**What goes wrong:** The D-03 "leaves the public list the instant `IN_GAME` starts" unregister call is placed directly inside `startMatch()` or called synchronously from within `onAlarm()`, and fails silently or throws at runtime because the cross-party API isn't available there.
**Why it happens:** `startMatch()`'s only call site today is inside `onAlarm()` (`apps/party/src/room.ts:199-217`) — a very natural place to also fire the directory-unregister call, but the one place PartyKit's own docs say the `context.parties` accessor doesn't work [CITED: docs.partykit.io/guides/using-multiple-parties-per-project].
<br>**How to avoid:** Use the documented raw-fetch workaround (`https://<project>.<user>.partykit.dev/parties/directory/lobby-directory`) if the unregister call must originate from inside `onAlarm`, or restructure so the directory call happens from `onMessage`/`onRequest` context where possible.
**Warning signs:** An unregister call that silently no-ops in production despite working in local dev (local dev's origin/routing can behave differently — verify against a real deployed instance, matching this project's own Phase 1 lesson about deployment-only bugs recorded in STATE.md).

### Pitfall 6: `LobbySeat`/`lobbySeatSchema` changes need `toSnapshot()` updated in lockstep
**What goes wrong:** A new field is added to `lobbySeatSchema` (Zod) but `toSnapshot()` (`apps/party/src/state.ts:199-214`) isn't updated to populate it, so every `ROOM_STATE` frame either fails Zod validation at `sendLobby`'s `serverMessageSchema.parse()` call or silently sends `undefined`.
**Why it happens:** The wire schema and the state-to-wire mapping function live in two different files (`packages/shared/src/protocol.ts` vs. `apps/party/src/state.ts`) with no compile-time link forcing them to stay in sync beyond TypeScript structural typing catching a missing required field.
**How to avoid:** Any new public seat field (personality/title readout, `controlledBy` if it needs to be public for LOBBY-07's UI, seat-count-related fields) must be added to both `lobbySeatSchema` and `toSnapshot()`'s seat-mapping in the same change.
**Warning signs:** A TypeScript error at `toSnapshot()`'s return statement (good — the compiler catches this) or, if the new field is optional/nullable, no compile error at all but a runtime UI showing `undefined`.

## Code Examples

### Directory party registration call (D-01)
```typescript
// Pattern verified from PartyKit's documented multi-party guide [CITED:
// docs.partykit.io/guides/using-multiple-parties-per-project]
// apps/party/src/directoryClient.ts (new file)
export async function registerLobby(
  room: Party.Room,
  payload: { code: string; seatsFilled: number; seatsTotal: number; hostCodename: string },
): Promise<void> {
  const directory = room.context.parties.directory.get('lobby-directory');
  await directory.fetch({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'REGISTER', ...payload }),
  });
}
```

### Grace-period entry shape mirroring the existing BotSubmission pattern
```typescript
// apps/party/src/state.ts — new export, modelled directly on the existing
// BotSubmission interface (apps/party/src/state.ts:84-90, read this session)
export interface DisconnectedSeat {
  readonly seatIndex: number;
  readonly playerId: string;
  /** Absolute ms timestamp — same convention as BotSubmission.releaseAt and
   *  RoomState.deadlineAt: never a remaining duration. */
  readonly graceExpiresAt: number;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Cloudflare Durable Objects with always-on WebSocket connections (pre-2023) | Hibernatable WebSockets API — the DO sleeps between messages, connections stay attached | PartyKit adopted this as its scaling story [CITED: docs.partykit.io/guides/scaling-partykit-servers-with-hibernation] | This is why the project's own `room.ts` comment already warns "Durable Objects can hibernate between messages" (`apps/party/src/room.ts:37-38`) and why per-connection logic must live in message/close handlers, never `onConnect` |
| Manual close-frame parsing for reconnect logic | Automatic close-handshake completion via `web_socket_auto_reply_to_close` compat flag (default-on for compat dates ≥ 2026-04-07) | Cloudflare workerd runtime change [CITED: developers.cloudflare.com/durable-objects docs, via WebSearch this session] | Not directly actionable this phase (compat date is set in `partykit.json` at `"compatibilityDate": "2024-01-01"` [VERIFIED: apps/party/partykit.json] — predates this flag's default-on date), but worth flagging: bumping `compatibilityDate` in a future phase would change `onClose`/`webSocketClose` semantics and should be tested deliberately, not incidentally |

**Deprecated/outdated:** None directly relevant — this phase doesn't touch anything with a documented deprecation path.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `onClose` on an abrupt (non-clean) network drop fires with some platform-dependent delay rather than instantly, making the effective reclaim window longer than the configured grace period | Pitfall 3 | If wrong (i.e. `onClose` is actually near-instant even for abrupt drops on this platform/compat-date combination), the grace-period design is over-cautious but not broken — low risk either way. If the delay is much larger than assumed, players could see AI takeover fire much later than expected after a real disconnect; worth a manual test during implementation with a real network-drop simulation (e.g. killing WiFi, not just closing the tab) rather than relying on this assumption |
| A2 | The recommended `controlledBy: 'HUMAN' \| 'AI' \| null` field (Pattern 2) is the right shape for representing D-08's live control flip — this is a design recommendation synthesized from reading `RoomSeat`/`fillEmptySeatsWithBots`/`decideForBotSeats` this session, not a value copied from an existing source | Pattern 2, throughout Architecture Patterns | If the planner chooses a different shape (e.g. overloading `kind` with a third seat kind, or a separate boolean), the specific field name/type here won't match — but the underlying requirement (origin vs. live-control must be separable) is the load-bearing finding, verified from source, not the exact field name |
| A3 | The `directory` party's registration payload should carry only `{ code, seatsFilled, seatsTotal, hostCodename }` per D-02 | Pattern 1, Code Examples | Low risk — directly derived from CONTEXT.md D-02's locked decision, not an independent assumption |

**If this table is empty:** N/A — see entries above. All are low-to-moderate risk and don't block planning; A1 in particular should inform a Nyquist validation test (manual network-drop simulation) rather than an automated unit test, since it depends on platform behavior outside this repo's control.

## Open Questions

1. **Should the directory room's registration payload be pushed eagerly on every seat mutation, or debounced?**
   - What we know: D-02's metadata (seat count X/Y, host codename) changes on every join/leave/kick/seat-count-change; the existing `sendLobby()` broadcast already fires on every one of those events with no debouncing.
   - What's unclear: Whether firing a directory-registration `fetch()` on every one of those same events (which the discretion note flags as "no specific dedup/failure-recovery logic beyond straightforward register/unregister calls" being acceptable) creates enough traffic to matter at this project's scale (a handful of friends' matches, not internet-scale matchmaking).
   - Recommendation: Fire eagerly, at the same points `sendLobby()` already fires — this project's traffic is nowhere near needing debouncing, and eager-and-simple matches D-01's Claude's-Discretion note exactly.

2. **What happens to the directory registration if a match room's Durable Object is evicted/crashes without ever calling unregister (e.g. mid-lobby, before `startMatch` or an explicit close)?**
   - What we know: D-03 ties unregistration to the `IN_GAME` transition; there's no requirement in CONTEXT.md for a TTL/heartbeat-based staleness check on the directory side.
   - What's unclear: Whether an abandoned, never-started lobby (all players left, room object eventually evicted by Cloudflare) leaves a permanently stale "phantom" entry in the directory list.
   - Recommendation: Out of scope for this phase per the Claude's-Discretion note explicitly deferring dedup/failure-recovery sizing to research/planning — flag as a known, accepted gap (a stale lobby entry that nobody can join since the room requires an actual open seat) rather than building a heartbeat/TTL system now.

3. **Does `SET_SEAT_COUNT` need a distinct rejection message, or can it reuse the existing `ERROR` message type?**
   - What we know: The existing triad pattern (`SUBMIT_LOADOUT`/`LOADOUT_ACK`/`LOADOUT_REJECTED`) uses dedicated ack/reject message types per feature; `ERROR` already exists as a generic catch-all with an `errorCodeSchema` enum (`UNKNOWN_CODE`, `ROOM_FULL`, `BAD_MESSAGE`, `WRONG_PHASE` — verified in `packages/shared/src/protocol.ts:117`).
   - What's unclear: Whether D-05's "blocked client- and server-side" requirement is better served by a dedicated `SEAT_COUNT_REJECTED` (matching the loadout precedent) or by extending `errorCodeSchema` with a new variant like `SEAT_COUNT_TOO_LOW`.
   - Recommendation: Follow the dedicated-message precedent (`LOADOUT_REJECTED`) for consistency, since D-05 is explicitly a validation-style rejection with a specific reason, matching the loadout case more closely than a generic protocol-level `ERROR`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PartyKit CLI (`partykit`) | Local dev + deploy of the new `directory` party | ✓ (per STATE.md: "PartyKit CLI... RESOLVED 2026-08-27") | 0.0.115 [VERIFIED: apps/party/package.json] | — |
| Cloudflare account / deployed `apps/party` room | Verifying directory cross-room `fetch()` in a real deployed environment (Pitfall 5's local-vs-deployed routing difference) | ✓ (per STATE.md: "apps/party IS deployed and verified live at https://berlin1988-party.maxmayermader.partykit.dev") | — | — |
| Vercel deployment of `apps/web` | End-to-end manual verification of the home-page directory list | ✗ (per STATE.md: "apps/web has no Vercel deployment in this environment" as of the last recorded session) | — | Local dev (`pnpm dev` against local PartyKit) is sufficient for implementation and automated testing; the phase-gate checkpoint pattern from Phase 1 (01-06's Task 3) suggests a deployed-environment manual check should be scheduled as its own checkpoint task, not assumed available mid-phase |

**Missing dependencies with no fallback:** none — the one missing piece (`apps/web` Vercel deployment) has a working local-dev fallback for all automated work; only a final manual cross-device verification needs the real deployment, exactly as Phase 1's own checkpoint pattern already established.

**Missing dependencies with fallback:** Vercel deployment of `apps/web` (see above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest [VERIFIED: root `package.json` scripts reference `vitest`; matches `docs/ARCHITECTURE.md` §6's testing-strategy table] |
| Config file | Root-level Vitest config (per-package, following the existing `packages/*/tests/` and `apps/web/lib/*.test.ts` convention already in the repo) |
| Quick run command | `pnpm test -- <pattern>` (e.g. `pnpm test -- directory` once new test files exist) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOME-03 | Directory list reflects seat count/host codename on register/update/unregister | unit (directory party logic, pure state functions) | `pnpm test -- directory` | ❌ Wave 0 |
| LOBBY-01 | `SET_SEAT_COUNT` accepted 1–4 pre-start, rejected mid/post-match | unit (`handleSetSeatCount`) | `pnpm test -- handlers` | ❌ Wave 0 (new cases in existing `handlers.test.ts`-style file, if one exists — verify at planning time) |
| LOBBY-02 | `KICK` removes a seat, target receives `KICKED`, non-host `KICK` rejected | unit (`handleKick`) | `pnpm test -- handlers` | ❌ Wave 0 |
| LOBBY-06 | Grace-period expiry triggers takeover; reclaim flips control back without double-submit | unit (`takeOverSeat`, `reclaimSeat`, `botSubmissions` purge) + integration (full round with a simulated reclaim mid-round) | `pnpm test -- bots` / `pnpm test -- room` | ❌ Wave 0 |
| LOBBY-07 | Public snapshot exposes `"Name the Title"` for AI-controlled seats | unit (`toSnapshot`, `seatRows`) | `pnpm test -- state` / `pnpm test -- seatRows` | ❌ Wave 0 (extends existing `seatRows.test.ts` — confirmed present at `apps/web/lib/seatRows.ts`; a matching `.test.ts` should already exist per the repo's co-location convention, verify at planning) |
| CHAT-01/02/03 | `CHAT_SEND` (free text and prompt) broadcasts `CHAT_MESSAGE` with codename attribution, scoped to lobby vs. match log | unit (`handleChatSend`) + wire-level fog-style scan (chat message never carries seat/agent identity — mirrors the existing fog-leak test pattern) | `pnpm test -- chat` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `pnpm test -- <touched-file-pattern>`
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the manual deployed-environment check noted in Environment Availability once `apps/web` has a Vercel deployment

### Wave 0 Gaps
- [ ] `apps/party/tests/directory.test.ts` (or equivalent) — covers HOME-03's register/update/unregister state transitions
- [ ] New cases in the existing handlers test file — covers LOBBY-01/LOBBY-02's accept/reject paths
- [ ] `apps/party/tests/bots.test.ts` extension (or new `takeover.test.ts`) — covers LOBBY-06's takeover + the verified `submitOrder()` overwrite race (Pitfall 2) with a regression test asserting a reclaimed seat's order is never overwritten by a stale `BotSubmission`
- [ ] Extension of `apps/web/lib/seatRows.test.ts` — covers LOBBY-07's `"Name the Title"` readout
- [ ] New `chat.test.ts` (party-side) — covers CHAT-01/02/03, including a fog-style scan asserting `CHAT_MESSAGE` never carries agent/seat identity fields (D-11)
- [ ] Framework install: none — Vitest is already fully configured project-wide

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Partial | This project has no accounts (PROJECT.md decision); "authentication" here means the existing opaque room-minted token model (`apps/party/src/auth.ts`) — D-08 extends its trust boundary (a token can now reclaim a seat mid-match, not just rebind pre-match) but does not introduce a new auth primitive |
| V3 Session Management | Yes | Existing `mintToken`/`seatFor`/`bindConnection` pattern (`apps/party/src/auth.ts`, read this session) — reused unchanged; no new session mechanism needed |
| V4 Access Control | Yes | Host-only actions (`SET_SEAT_COUNT`, `KICK`) must be verified against `state.hostPlayerId === seatFor(connectionId).playerId` server-side, never a client-supplied "am I host" flag — mirrors the existing rule already documented in `apps/party/CLAUDE.md` rule 5 ("Host-only messages are verified against the seat that owns the room, not against a flag in the message body") |
| V5 Input Validation | Yes | Every new message type (`SET_SEAT_COUNT`, `KICK`, `CHAT_SEND`) must be a new member of `clientMessageSchema`'s Zod discriminated union, following the exact pattern every existing message already uses — no ad hoc validation |
| V6 Cryptography | No | Not applicable — no new cryptographic operations this phase; `mintToken` (already existing) continues to draw from the engine's seeded PRNG, not a cryptographic RNG, which is an accepted existing project pattern for a "private-lobby usability code, not a security token" (comment verbatim from `apps/party/src/joinCode.ts:7`) — worth noting `mintToken` in `auth.ts` reuses the *same* PRNG-based approach for player/connection tokens, not just join codes; this is pre-existing behavior, not something this phase changes |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| A non-host client sends `KICK`/`SET_SEAT_COUNT` for another seat | Elevation of Privilege | Server-side host-seat check via `seatFor(connectionId)`, never trusting a client-supplied host flag (existing project rule, restated above) |
| A kicked player immediately reconnects and self-un-kicks by replaying their old token | Spoofing / repudiation of the kick | D-06 explicitly allows rejoin with the join code (not a ban) — this is a deliberate, locked, non-security requirement, not a vulnerability; no mitigation needed since it's the intended behavior |
| Chat message carries a spoofed identity in the payload | Spoofing | `CHAT_SEND` must never accept a codename/identity field — codename is always resolved server-side from `seatFor(connectionId).codename`, exactly like every existing message (D-11 restates this as a design constraint, not just a privacy nicety) |
| Directory room receives excessive/malformed registration traffic from a compromised or misbehaving match room | Denial of Service (of the directory party, affecting the home-page list for everyone) | Directory party should Zod-validate its own inbound `fetch()` payloads exactly like the match room does for client messages — the cross-party `fetch()` call is still an untrusted-input boundary even though it originates from this project's own code, since a bug in the match room could still send malformed data |
| A bot-controlled seat's queued order silently overwrites a reclaiming human's real order (Pitfall 2) | Tampering (of a sort — not attacker-initiated, but a genuine correctness/integrity bug with real gameplay consequences) | The `botSubmissions` purge-on-reclaim fix described in Pattern 3 — while not a classic "attacker" threat, this is exactly the kind of state-integrity bug ASVS V4/V5-style rigor exists to catch, and it was found by reading the actual engine code, not by threat-modeling in the abstract |

## Sources

### Primary (HIGH confidence)
- `apps/party/src/state.ts`, `handlers.ts`, `bots.ts`, `room.ts`, `timers.ts`, `broadcast.ts`, `auth.ts`, `joinCode.ts`, `settings.ts` — read in full this session
- `packages/shared/src/protocol.ts`, `state.ts`, `enums.ts`, `ids.ts` — read in full this session
- `packages/ai/src/personalities/index.ts`, `index.ts` — read in full this session
- `apps/web/lib/socket.ts`, `identity.ts`, `matchStore.ts`, `uiStore.ts`, `seatRows.ts` — read in full this session
- `apps/web/app/lobby/[code]/page.tsx`, `apps/web/app/page.tsx`, `apps/web/app/match/[code]/page.tsx` — read in full this session
- `apps/web/components/lobby/SeatList.tsx` — read in full this session
- `packages/engine/src/submitOrder.ts` — read (relevant section) this session — the source of Pitfall 2/Pattern 3's finding
- `apps/party/package.json`, `apps/web/package.json`, `apps/party/partykit.json` — read this session for verified version numbers and config
- `docs/ARCHITECTURE.md` §§1-9 — read in full this session
- `docs/AI_OPPONENTS.md` — read in full this session
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` (Phase 1–3 sections) — read this session

### Secondary (MEDIUM confidence)
- docs.partykit.io/guides/using-multiple-parties-per-project/ — fetched this session (WebFetch), the source for Pattern 1's `room.context.parties` API and the `onAlarm` limitation
- docs.partykit.io/reference/partyserver-api/ — fetched this session, the source for `onClose(connection: Party.Connection)` signature and `getConnections()` tag-filter note
- docs.partykit.io/guides/scaling-partykit-servers-with-hibernation/ — fetched this session, the source for the `onConnect` handler-loss-on-hibernation caveat
- docs.partykit.io/reference/partysocket-api/ — referenced via WebSearch this session, the source for auto-reconnect configuration options
- developers.cloudflare.com/durable-objects/api/alarms — referenced via WebSearch this session, the source for "single alarm per DO" and "alarms survive hibernation"

### Tertiary (LOW confidence)
- WebSearch-only findings on abrupt-disconnect `onClose` timing and the `web_socket_auto_reply_to_close` compat flag — not independently verified against primary Cloudflare docs this session beyond search-result summaries; flagged in Assumptions Log (A1) and State of the Art

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all versions read directly from this repo's own `package.json`/`partykit.json` files this session
- Architecture: HIGH for in-repo patterns (all read from source), MEDIUM for PartyKit platform specifics (official docs fetched this session, but not independently load-tested against this project's deployed instance)
- Pitfalls: HIGH for Pitfalls 1, 2, 4, 5, 6 (each grounded in a specific, quoted, this-session read of actual source code); MEDIUM-LOW for Pitfall 3 (platform behavior not fully documented by PartyKit's own docs as fetched this session)

**Research date:** 2026-08-31
**Valid until:** ~30 days (stable in-repo architecture) for the in-repo findings; PartyKit/Cloudflare platform-behavior findings should be re-verified against a real deployed test if the implementation's actual observed behavior diverges from what's documented here, since Pitfall 3/A1 in particular rest on incomplete official documentation rather than a direct test.
