# Phase 3: Open Lobbies, Host Control & Table Talk - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 17 (new + modified)
**Analogs found:** 17 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `packages/shared/src/protocol.ts` (+schemas) | config/schema | request-response | same file, existing message members (`SUBMIT_LOADOUT`/`LOADOUT_ACK`/`LOADOUT_REJECTED`, `lobbySeatSchema`/`toSnapshot`) | exact |
| `apps/party/src/state.ts` (+`controlledBy`, `DisconnectedSeat`, `setSeatCount`, chat log fields) | model/state | CRUD | same file, `RoomSeat`/`RoomState`/`BotSubmission`/`setReady`/`toSnapshot` | exact |
| `apps/party/src/handlers.ts` (+`handleSetSeatCount`, `handleKick`, `handleChatSend`, reclaim branch in `handleJoin`) | controller (message handler) | request-response | same file, `handleSetReady`/`handleSubmitLoadout`/`handleJoin` | exact |
| `apps/party/src/bots.ts` (+`takeOverSeat`, generalize `decideForBotSeats`) | service | event-driven | same file, `fillEmptySeatsWithBots`/`decideForBotSeats`/`releaseBotSubmissions` | exact |
| `apps/party/src/timers.ts` (+grace-period scheduling helper) | utility | event-driven | same file, `scheduleRoundDeadline`/`onRoundAlarm`/`botDelayMs` | exact |
| `apps/party/src/room.ts` (+onClose grace timer, +new handler wiring, +roundAlarmTarget grace entries) | controller (Durable Object) | event-driven | same file, `onMessage`/`onAlarm`/`onClose`/`roundAlarmTarget`/`syncAlarm` | exact |
| `apps/party/src/directory.ts` (NEW — directory PartyKit party) | service (2nd Durable Object) | pub-sub | `apps/party/src/room.ts` (Party.Server shape: `onStart`, `onMessage`/`onRequest`, storage) | role-match (new party class, same framework contract) |
| `apps/party/src/directoryClient.ts` (NEW — register/update/unregister helper) | utility | event-driven | `apps/party/src/joinCode.ts` (small pure/async helper module called from room lifecycle points) | role-match |
| `apps/party/src/chat.ts` (NEW — chat log + FLAVOR_PROMPTS) | service | CRUD | `apps/party/src/state.ts`'s `setReady`/`setCodename` (immutable seat-scoped state writer) + `apps/party/src/bots.ts`'s `BOT_DIFFICULTY` constant-export pattern | role-match |
| `apps/party/partykit.json` (+`directory` party entry) | config | — | same file, existing `parties.match` entry | exact |
| `apps/web/lib/directorySocket.ts` (NEW) | hook/provider | streaming (WebSocket) | `apps/web/lib/socket.ts`'s `useRoomSocket` | exact |
| `apps/web/lib/chatStore.ts` (NEW — Zustand store) | store | CRUD | `apps/web/lib/matchStore.ts` / `apps/web/lib/uiStore.ts` (not read directly but same established Zustand pattern per `apps/web/lib/CLAUDE.md`) — closest read analog is `apps/web/lib/identity.ts`'s persisted-state shape | role-match |
| `apps/web/lib/socket.ts` (+`CHAT_MESSAGE`/`KICKED`/`DIRECTORY_STATE` dispatch) | hook/provider | streaming | same file, existing `onMessage` dispatch chain (`VIEW`/`ROUND_RESOLVED`/`LOADOUT_ACK` branches) | exact |
| `apps/web/app/page.tsx` (+Open Lobbies list, +kicked banner) | route (RSC + client island) | request-response | same file (thin RSC shell) + `apps/web/components/home/CreateJoinPanel.js` (not read; referenced) | role-match |
| `apps/web/app/lobby/[code]/page.tsx` (+seat-count control, +kick buttons, +chat panel) | route (client) | streaming | same file (not read this session, but is the direct target — canonical ref confirms structure); component-level analog is `SeatList.tsx` | exact (self) |
| `apps/web/components/lobby/SeatList.tsx` (+kick button, +AI title readout, +"Reconnecting…" state) | component | request-response | same file (existing seat row rendering over `seatRows()`) | exact |
| `apps/web/lib/seatRows.ts` (+`controlledBy`/title fields on `SeatRow`) | utility (pure view model) | transform | same file, existing `seatRows()`/`readySummary()`/`shouldShowCountdown()` | exact |
| `apps/web/components/lobby/ChatPanel.tsx` (NEW) | component | request-response | `apps/web/components/lobby/SeatList.tsx` (list-of-rows-over-a-pure-view-model component shape) | role-match |
| `apps/web/app/match/[code]/page.tsx` (+chat panel) | route (client) | streaming | same file (not read this session; canonical ref confirms target) | exact (self) |

## Pattern Assignments

### `packages/shared/src/protocol.ts` (config/schema, request-response)

**Analog:** same file — existing triad pattern and public-snapshot rules

**Discriminated-union message member pattern** (lines 62-97, 224-236):
```typescript
z.object({
  type: z.literal('SUBMIT_LOADOUT'),
  cards: z.array(cardIdOnWire).max(64),
}),
// ...
z.object({
  type: z.literal('LOADOUT_ACK'),
  cards: z.array(z.string()),
}),
z.object({
  type: z.literal('LOADOUT_REJECTED'),
  message: z.string(),
}),
```
New `SET_SEAT_COUNT`/`SEAT_COUNT_ACK`/`SEAT_COUNT_REJECTED`, `KICK`/`KICKED`, `CHAT_SEND`/`CHAT_MESSAGE`, and `DIRECTORY_STATE` should each be added as new members of `clientMessageSchema`/`serverMessageSchema` following this exact triad shape (Open Question 3 in RESEARCH.md recommends the dedicated-message precedent over a generic `ERROR`).

**No-identity-field convention** (lines 100-112, comments):
```typescript
// SUBMIT_ORDER, like SET_READY and SET_CODENAME, carries no playerId — the
// acting seat is resolved from the connection binding (apps/party/src/auth.ts
// seatFor), never trusted from the message body.
```
`CHAT_SEND` must follow this identically — body carries only `{ text }` or `{ promptId }`, never a codename (D-11).

**Public seat schema — extend in lockstep with `toSnapshot()`** (lines 131-144):
```typescript
export const lobbySeatSchema = z.object({
  index: z.number().int().min(0),
  playerId: z.string().nullable(),
  codename: z.string().nullable(),
  faction: sectorSchema,
  kind: seatKindSchema,
  ready: z.boolean(),
});
```
Add a new optional public field here (e.g. `aiReadout: string | null` for "{Name} the {Title}", and/or `controlledBy` if the UI needs it) — Pitfall 6 warns this must be updated in the same change as `apps/party/src/state.ts`'s `toSnapshot()`.

---

### `apps/party/src/state.ts` (model/state, CRUD)

**Analog:** same file

**Server-only field convention, extended for `controlledBy`** (lines 35-52):
```typescript
export interface RoomSeat extends LobbySeat {
  token: string | null;
  connectionId: string | null;
  personality: PersonalityId | null;
  difficulty: Difficulty | null;
  loadout: CardId[] | null;
}
```
Add `controlledBy: 'HUMAN' | 'AI' | null` here per RESEARCH.md Pattern 2 — orthogonal to `kind`, never overloading `kind: 'BOT'` for a live takeover (Anti-Pattern, explicit).

**Immutable single-seat mutation pattern to copy for `setSeatCount`/kick/reclaim** (lines 122-139):
```typescript
export function setReady(state: RoomState, playerId: string, ready: boolean): RoomState {
  if (state.phase !== 'LOBBY') return state;
  return {
    ...state,
    seats: state.seats.map((seat) => (seat.playerId === playerId ? { ...seat, ready } : seat)),
  };
}
```
`setSeatCount(state, newCount)` should be a pure function of this exact shape (guard on phase, `.map` over seats, return new state) — RESEARCH.md's "Don't Hand-Roll" table recommends a single `canSetSeatCount(state, newCount): boolean` predicate used both server-side (authoritative) and client-side (UX grey-out), mirroring `validateLoadout`/`loadoutLegality`'s split.

**`toSnapshot()` — the lockstep-update site** (lines 198-214):
```typescript
export function toSnapshot(state: RoomState): LobbySnapshot {
  return {
    code: state.code,
    phase: state.phase,
    hostPlayerId: state.hostPlayerId,
    startsAt: state.startsAt,
    seats: state.seats.map((seat) => ({
      index: seat.index,
      playerId: seat.playerId,
      codename: seat.codename,
      faction: seat.faction,
      kind: seat.kind,
      ready: seat.ready,
    })),
  };
}
```
Any new public field (AI title readout, seat count) must be added here in the same commit as the schema change (Pitfall 6).

**BotSubmission shape to mirror for grace-period entries** (lines 81-90):
```typescript
export interface BotSubmission {
  readonly playerId: string;
  readonly order: AgentOrder;
  readonly releaseAt: number;
}
```
New `DisconnectedSeat { seatIndex, playerId, graceExpiresAt }` (RESEARCH.md Code Examples) should be added as a new `RoomState` array field, same shape/convention (absolute ms timestamp, never a duration).

---

### `apps/party/src/handlers.ts` (controller, request-response)

**Analog:** same file

**Host-authority verification is not present here yet (no host-only handler exists in Phase 1/2) — model it on the seatFor-resolution pattern used by every existing handler** (lines 180-204):
```typescript
export function handleSetReady(
  state: RoomState | null,
  ready: boolean,
  connectionId: string,
  now: number,
): RoomState | null {
  if (!state) return null;
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return state;
  const withReady = setReady(state, seat.playerId, ready);
  return recomputeCountdown(withReady, now, COUNTDOWN_DURATION_MS);
}
```
`handleSetSeatCount`/`handleKick` must additionally check `seat.playerId === state.hostPlayerId` before mutating — per `apps/party/CLAUDE.md` rule 5 and `apps/party/src/CLAUDE.md`'s own host-only-message rule — returning an `ERROR`/dedicated-rejection message (never silently no-op) when a non-host sends one.

**Validate-before-store + dedicated-reject pattern to copy for `SET_SEAT_COUNT`** (lines 311-344, `handleSubmitLoadout`):
```typescript
export function handleSubmitLoadout(
  state: RoomState | null,
  message: Extract<ClientMessage, { type: 'SUBMIT_LOADOUT' }>,
  connectionId: string,
): SubmitLoadoutResult {
  if (!state) return { state: null, toSender: null };
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return { state, toSender: null };
  if (state.phase !== 'LOBBY' && state.phase !== 'LOADOUT') {
    return {
      state,
      toSender: { type: 'ERROR', code: 'WRONG_PHASE', message: 'The match has already started.' },
    };
  }
  const violations = validateLoadout(message.cards, DEFAULT_RULESET);
  if (violations.length > 0) {
    return {
      state,
      toSender: { type: 'LOADOUT_REJECTED', message: violations.map((v) => v.message).join(' ') },
    };
  }
  const nextState = setLoadout(state, seat.playerId, [...message.cards]);
  return { state: nextState, toSender: { type: 'LOADOUT_ACK', cards: message.cards.map((id) => id as string) } };
}
```
`handleSetSeatCount` follows this exact shape: resolve seat → host check → phase guard (must be pre-`IN_GAME`) → `canSetSeatCount` validation (D-05: reject if below occupied count) → dedicated ack/reject.

**Token-rebind branch in `handleJoin` — the base for D-08's reclaim path** (lines 117-136):
```typescript
if (message.token) {
  const existing = state.seats.find((seat) => seat.token === message.token);
  if (existing) {
    const rebound = recomputeCountdown(
      bindConnection(state, connectionId, existing.index),
      now,
      COUNTDOWN_DURATION_MS,
    );
    return {
      state: rebound,
      toSender: { type: 'JOINED', playerId: existing.playerId ?? '', token: message.token, code: state.code },
      broadcastRoomState: true,
    };
  }
}
```
Per RESEARCH.md's Alternatives-Considered table, extend this branch (not a new message type) so that when `existing.controlledBy === 'AI'`, it also flips `controlledBy` back to `'HUMAN'` and purges matching `botSubmissions` entries (Pattern 3) as one atomic state transition before returning.

---

### `apps/party/src/bots.ts` (service, event-driven)

**Analog:** same file

**Seat-fill pattern, LOBBY-only — do not extend this one for mid-match takeover** (lines 38-53):
```typescript
export function fillEmptySeatsWithBots(state: RoomState, rng: RngState): RoomState {
  const seats: RoomSeat[] = state.seats.map((seat) => {
    if (seat.playerId !== null) return seat;
    const personality = PERSONALITY_IDS[nextInt(rng, PERSONALITY_IDS.length)]!;
    return {
      ...seat,
      playerId: `bot-${seat.index}-${personality.toLowerCase()}`,
      codename: titleCase(personality),
      kind: 'BOT' as const,
      personality,
      difficulty: BOT_DIFFICULTY,
      ready: true,
    };
  });
  return { ...state, seats };
}
```
`takeOverSeat(state, seatIndex, rng)` is a new, distinct function (RESEARCH.md Pattern 2) — it must preserve the seat's existing `playerId`/`token`/`codename`/`kind` (still `'HUMAN'`), only setting `controlledBy: 'AI'` and assigning a `personality`/`difficulty` for the interim, unlike `fillEmptySeatsWithBots`'s destructive-fresh-identity approach.

**Bot-seat filter to generalize** (line 82):
```typescript
if (seat.kind !== 'BOT' || !seat.playerId || !seat.personality) continue;
```
`decideForBotSeats` should change this condition to `seat.controlledBy !== 'AI'` (covers both original BOT-kind seats and AI-takeover HUMAN-kind seats), per RESEARCH.md Pattern 2's recommended shape.

**`releaseBotSubmissions` — the identical `submitOrder()` path humans use, and the purge target for D-08** (lines 112-146):
```typescript
export function releaseBotSubmissions(
  state: RoomState,
  now: number,
): { state: RoomState; released: string[] } {
  // ...
  for (const submission of state.botSubmissions) {
    if (submission.releaseAt > now) { remaining.push(submission); continue; }
    attempted = true;
    const result = submitOrder(gameState, toPlayerId(submission.playerId), submission.order);
    if (!result.rejection) { gameState = result.state; released.push(submission.playerId); }
  }
  // ...
}
```
`reclaimSeat()`'s purge step (Pattern 3) must filter `state.botSubmissions` by `playerId` synchronously, mirroring how this function already filters by `releaseAt` — same array-filter idiom, new predicate.

---

### `apps/party/src/timers.ts` (utility, event-driven)

**Analog:** same file

**Write-once absolute-timestamp scheduling pattern to copy for grace-period start** (lines 23-33):
```typescript
export function scheduleRoundDeadline(state: RoomState, now: number): RoomState {
  if (!state.gameState) return state;
  if (state.deadlineRound === state.gameState.round) return state;
  const seconds = state.gameState.settings.roundTimerSeconds;
  return {
    ...state,
    deadlineAt: seconds === null ? null : now + seconds * 1000,
    deadlineRound: state.gameState.round,
  };
}
```
A new `scheduleDisconnectGrace(state, seatIndex, now, durationMs)` should push a `DisconnectedSeat { seatIndex, playerId, graceExpiresAt: now + durationMs }` entry, guarded so a seat already in the array isn't double-scheduled — same write-once discipline.

**Alarm-firing guard pattern to copy for grace expiry** (lines 46-52):
```typescript
export function onRoundAlarm(state: RoomState, now: number): RoomState {
  if (state.deadlineAt === null || now < state.deadlineAt) return state;
  const closed = closeRound(state, 'DEADLINE');
  if (closed.phase !== 'IN_GAME') return closed;
  return scheduleRoundDeadline(closed, now);
}
```
A grace-expiry handler (called from `room.ts`'s `onAlarm`) should follow the identical `if (past deadline) act; else no-op` shape, then call `takeOverSeat` for each expired `DisconnectedSeat`.

---

### `apps/party/src/room.ts` (controller/Durable Object, event-driven)

**Analog:** same file

**Message-routing branch pattern to copy for `SET_SEAT_COUNT`/`KICK`/`CHAT_SEND`** (lines 128-146, `SET_READY`):
```typescript
if (message.type === 'SET_READY') {
  const next = handleSetReady(this.state, message.ready, sender.id, now);
  await this.persist(next);
  if (next) {
    await this.syncAlarm(next);
    sendLobby(this.room, next);
  }
  return;
}
```
New handlers follow this exact shape: call the pure handler, `persist`, conditionally `syncAlarm`, `sendLobby`/`sendTo` as appropriate. `KICK` additionally needs a direct `sendTo` of a `KICKED` message to the target connection (not just the sender) — a new send target not yet present in this file, closest precedent is `sendTo(sender, result.toSender)` used throughout.

**`onClose` — currently a documented no-op, this is the direct implementation site for D-07** (lines 177-181):
```typescript
onClose(): void {
  // No reconnection handling in Phase 1 (D-11) — an accepted, documented
  // gap, not a bug. A dropped connection simply leaves its seat bound to a
  // now-dead connection id until the room is next touched.
}
```
Must become: resolve the seat via `seatFor(state, connection.id)`, call `scheduleDisconnectGrace`, `persist`, `syncAlarm` — following the exact `persist`/`syncAlarm` pairing every other mutating handler in this file uses.

**`roundAlarmTarget` — the min-of-targets pattern grace-period entries fold into** (lines 307-312):
```typescript
private roundAlarmTarget(state: RoomState): number | null {
  const targets: number[] = [];
  if (state.deadlineAt !== null) targets.push(state.deadlineAt);
  for (const submission of state.botSubmissions) targets.push(submission.releaseAt);
  return targets.length > 0 ? Math.min(...targets) : null;
}
```
Add `for (const d of state.disconnectedSeats) targets.push(d.graceExpiresAt);` — a one-line extension of an already-proven pattern (RESEARCH.md Pattern 4), not new architecture.

**`onAlarm`'s phase-branch dispatch — the template for folding grace-expiry handling into the `IN_GAME` branch** (lines 219-266): read in full above; grace-expiry processing (calling `takeOverSeat` for expired entries) belongs alongside `releaseBotSubmissions` at the top of the `IN_GAME` branch, before the `shouldCloseRound` check.

---

### `apps/party/src/directory.ts` (NEW — service/2nd Durable Object, pub-sub)

**Analog:** `apps/party/src/room.ts`'s `Party.Server` shape (constructor, `onStart`, `onMessage`/`onRequest`, `room.storage`) — this is a new file, but must implement the same `Party.Server` interface contract already proven in `room.ts`.

**Directory registration call site (from `MatchRoom`, calling into the new party)** — RESEARCH.md's verified Code Example:
```typescript
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
**Caveat (Pitfall 5, verified this session):** `room.context.parties` is unavailable inside `onAlarm` — the D-03 unregister call fired from `startMatch()` (called from `onAlarm`, `room.ts:199-217`) must use the raw-fetch workaround (`https://<project>.<user>.partykit.dev/parties/directory/lobby-directory`) or be restructured to fire from `onMessage`/`onRequest` context.

**`partykit.json` — one-line addition, verified current content:**
```json
{
  "parties": {
    "match": "src/room.ts",
    "directory": "src/directory.ts"
  }
}
```

---

### `apps/party/src/chat.ts` (NEW — service, CRUD)

**Analog:** `apps/party/src/state.ts`'s `setReady`/`setCodename` (immutable seat-scoped writer) for the log-append function shape; `apps/party/src/bots.ts`'s `BOT_DIFFICULTY` top-level-constant-export pattern for `FLAVOR_PROMPTS`.

**Constant-export pattern to copy** (bots.ts lines 17-25):
```typescript
export const BOT_DIFFICULTY: Difficulty = 'HANDLER';
```
`FLAVOR_PROMPTS: readonly string[]` (the ~8-10 lines from 03-UI-SPEC.md's Copywriting Contract) should be a similarly-documented top-level export, either here or in `packages/shared` if the client needs the same list for a picker UI (RESEARCH.md's `Phase Requirements` table flags this as an open implementation choice — `packages/shared` is the safer placement since both `apps/web` and `apps/party` need the same list, and cross-package sharing is exactly what `packages/shared` is for per `packages/shared/CLAUDE.md`).

**Seat-resolved attribution — do not accept a client-supplied codename** (handlers.ts pattern, lines 180-191, restated): `handleChatSend` must resolve `codename` via `seatFor(state, connectionId).codename`, never `message.codename` — there is no such field to read, by design (D-11).

---

### `apps/web/lib/directorySocket.ts` (NEW — hook/provider, streaming)

**Analog:** `apps/web/lib/socket.ts`'s `useRoomSocket`

**usePartySocket wiring pattern to copy** (lines 101-171):
```typescript
export function useRoomSocket(
  code: string,
  codename: string,
  onMessage: (message: ServerMessage) => void,
): PartySocket {
  return usePartySocket({
    host: partyHost(),
    party: 'match',
    room: code,
    onOpen(event) { /* ... */ },
    onMessage(event) {
      let parsed: ReturnType<typeof serverMessageSchema.safeParse>;
      try {
        parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const message = parsed.data;
      // ... dispatch into Zustand stores
      onMessage(message);
    },
  });
}
```
`useDirectorySocket()` follows the identical shape: `party: 'directory'`, `room: 'lobby-directory'`, Zod-parse every inbound frame, dispatch `DIRECTORY_STATE` into a new `directoryStore` (or directly into a hook's local state) — no `JOIN` handshake needed since the directory party has no seats, just a read-only broadcast subscription.

---

### `apps/web/lib/chatStore.ts` (NEW — Zustand store, CRUD)

**Analog:** the store-per-concern convention documented in `apps/web/lib/CLAUDE.md` (`matchStore.ts` holds `PlayerView` + pending orders, `uiStore.ts` holds UI-only state) — `chatStore.ts` should hold two separate message-log arrays (lobby, match) per D-10, mirroring how `matchStore.ts`/`uiStore.ts` are two separate stores for two separate concerns rather than one god-store. Dispatch into it happens from `socket.ts`'s `onMessage`, exactly like existing `useMatchStore.getState().setView(...)` calls (socket.ts lines 131-166) — `CHAT_MESSAGE` should add a `useChatStore.getState().appendMessage(scope, message)` call in the same `onMessage` chain.

---

### `apps/web/lib/socket.ts` (hook/provider, streaming — modified)

**Analog:** same file, existing dispatch chain

**Dispatch-per-message-type pattern to extend** (lines 131-166):
```typescript
if (message.type === 'VIEW') {
  useMatchStore.getState().setView(message.view);
} else if (message.type === 'ROUND_RESOLVED') {
  // ...
} else if (message.type === 'LOADOUT_ACK') {
  useLoadoutStore.getState().recordAccepted(message.cards.map(cardId));
} else if (message.type === 'LOADOUT_REJECTED') {
  useLoadoutStore.getState().setSaveStatus({ state: 'rejected', message: message.message });
}
```
Add `else if (message.type === 'CHAT_MESSAGE')`, `else if (message.type === 'KICKED')` (trigger redirect + banner, likely via a new `uiStore` flag consumed by `page.tsx`), branches in this exact `else if` chain — never a second `onMessage` handler elsewhere (rule 1, `apps/web/lib/CLAUDE.md`: "socket.ts is the only place that touches the network").

---

### `apps/web/components/lobby/SeatList.tsx` (component, request-response — modified)

**Analog:** same file

**Pure-view-model-driven row rendering to extend** (lines 22-56, 58-76):
```typescript
export function SeatList({ snapshot, onToggleReady, myPlayerId = null }: SeatListProps) {
  const rows = seatRows(snapshot);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => ( /* ... */ ))}
    </ul>
  );
}
function SeatRowBody({ row }: { row: SeatRow }) {
  return (
    <>
      <span className="truncate">
        {row.label}
        {row.isAi && (
          <span className="ml-2 rounded border border-[#e2e8f0] px-1 text-xs font-semibold uppercase text-[#64748b]">
            AI
          </span>
        )}
      </span>
      {/* ready badge */}
    </>
  );
}
```
This component decides nothing — all new logic (AI title readout text, "Reconnecting…" state, kick-button visibility) must be computed in `seatRows.ts` and merely rendered here, per `apps/web/components/CLAUDE.md`. Replace the bare `"AI"` badge with `row.aiReadout` (e.g. "Katja Reiner the Ghost") when `row.isAi` and `row.aiReadout !== null`; add a `row.status: 'normal' | 'reconnecting' | 'ai'` discriminant per 03-UI-SPEC.md's "three distinct, mutually exclusive seat states." Add a host-only, non-self "Kick" button using the existing `Button` primitive (`apps/web/components/ui/Button.tsx`, destructive variant — read at project context, not deep-inspected this session but the only `ui/` primitive that exists).

---

### `apps/web/lib/seatRows.ts` (utility/pure view model, transform — modified)

**Analog:** same file

**Row-shaping function to extend** (lines 31-55):
```typescript
export function seatRows(snapshot: LobbySnapshot): SeatRow[] {
  return snapshot.seats.map((seat) => {
    if (seat.kind === 'OPEN') { /* ... */ }
    return {
      index: seat.index,
      playerId: seat.playerId,
      label: seat.codename,
      kind: seat.kind,
      badgeText: seat.ready ? READY_BADGE_TEXT : NOT_READY_BADGE_TEXT,
      isAi: seat.kind === 'BOT',
    };
  });
}
```
Add `aiReadout: string | null` (built from the new `lobbySeatSchema` field) and a `status` field derived from `controlledBy`/grace-period presence to `SeatRow`, computed here — the pure, unit-testable layer this codebase already uses for exactly this kind of rule (per the file's own header comment: "no React... this is where these rules become unit-testable at all").

---

### `apps/web/components/lobby/ChatPanel.tsx` (NEW — component, request-response)

**Analog:** `apps/web/components/lobby/SeatList.tsx`

Same list-over-pure-view-model shape: a `chatRows()`-style pure function (in `chatStore.ts` or a new `lib/chatRows.ts`) shapes the message array, `ChatPanel.tsx` renders it plus an input + Send button (using `Button.tsx`) and a flavor-prompt picker. Follows `SeatList.tsx`'s convention of "component decides nothing" — sender-codename-bold-above-body-text layout is new visual work per 03-UI-SPEC.md, but the list-rendering shape (`<ul>` of rows keyed by an id) mirrors `SeatList.tsx` lines 22-56 directly.

---

## Shared Patterns

### Host-only authority verification
**Source:** `apps/party/CLAUDE.md` rule 5, `apps/party/src/CLAUDE.md` rule 5 (documented rule, not yet a code example in this repo — no host-only handler exists before Phase 3)
**Apply to:** `handleSetSeatCount`, `handleKick`
```typescript
// Pattern to introduce, modelled on seatFor's existing role in every handler:
const seat = seatFor(state, connectionId);
if (!seat || !seat.playerId) return { state, toSender: null };
if (state.hostPlayerId !== seat.playerId) {
  return { state, toSender: { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Host only.' } };
}
```

### Immutable single-field seat mutation
**Source:** `apps/party/src/state.ts:122-158` (`setReady`, `setCodename`, `setLoadout`)
**Apply to:** `setSeatCount`, `setControlledBy`/`reclaimSeat`, `removeSeat` (kick)
```typescript
export function setReady(state: RoomState, playerId: string, ready: boolean): RoomState {
  if (state.phase !== 'LOBBY') return state;
  return {
    ...state,
    seats: state.seats.map((seat) => (seat.playerId === playerId ? { ...seat, ready } : seat)),
  };
}
```

### `persist` → `syncAlarm` → broadcast sequencing
**Source:** `apps/party/src/room.ts:128-146` and throughout `onMessage`
**Apply to:** every new message handler wired into `room.ts`
```typescript
const next = handleX(this.state, ..., now);
await this.persist(next);
if (next) {
  await this.syncAlarm(next);
  sendLobby(this.room, next); // or sendTo(sender, ...) for a targeted reply
}
```

### Write-once absolute-timestamp scheduling
**Source:** `apps/party/src/timers.ts:23-33` (`scheduleRoundDeadline`), extended by `apps/party/src/room.ts:307-312` (`roundAlarmTarget`'s min-of-targets)
**Apply to:** grace-period timer (D-07)
```typescript
if (state.deadlineRound === state.gameState.round) return state; // write-once guard
// ... and folding into roundAlarmTarget's Math.min(...targets)
```

### No client-supplied identity fields
**Source:** `packages/shared/src/protocol.ts:100-112` (comments), enforced via `seatFor(connectionId)` in every handler
**Apply to:** `CHAT_SEND` (D-11), `KICK` target resolution (target seat index, not target playerId claimed by sender)

### Zod schema is the single source of truth, `toSnapshot()` updated in lockstep
**Source:** `packages/shared/src/protocol.ts:136-144` + `apps/party/src/state.ts:198-214`, Pitfall 6
**Apply to:** every new public seat/lobby field this phase introduces

## No Analog Found

None — every new file in this phase has at least a role-match analog already in the repo (this phase is explicitly "additive engineering on proven patterns," per RESEARCH.md's Summary).

## Metadata

**Analog search scope:** `apps/party/src/`, `apps/web/lib/`, `apps/web/components/lobby/`, `apps/web/app/`, `packages/shared/src/`, `packages/ai/src/personalities/`
**Files scanned:** `state.ts`, `handlers.ts`, `bots.ts`, `timers.ts`, `room.ts`, `protocol.ts`, `personalities/index.ts`, `socket.ts`, `identity.ts`, `seatRows.ts`, `SeatList.tsx`, `page.tsx`, plus all project/package `CLAUDE.md` files for convention constraints
**Pattern extraction date:** 2026-08-31
