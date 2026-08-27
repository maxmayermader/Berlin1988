---
phase: 01-playable-skeleton
reviewed: 2026-08-27T20:02:43Z
depth: standard
files_reviewed: 76
files_reviewed_list:
  - packages/shared/src/protocol.ts
  - packages/shared/src/view.ts
  - packages/engine/src/fog/projectView.ts
  - packages/engine/tests/score-symmetry.test.ts
  - apps/party/src/room.ts
  - apps/party/src/state.ts
  - apps/party/src/handlers.ts
  - apps/party/src/broadcast.ts
  - apps/party/src/auth.ts
  - apps/party/src/joinCode.ts
  - apps/party/src/bots.ts
  - apps/party/src/settings.ts
  - apps/party/src/round.ts
  - apps/party/src/timers.ts
  - apps/party/tests/helpers.ts
  - apps/party/tests/join.test.ts
  - apps/party/tests/joinCode.test.ts
  - apps/party/tests/botfill.test.ts
  - apps/party/tests/lobby.test.ts
  - apps/party/tests/round.test.ts
  - apps/party/tests/clock.test.ts
  - apps/party/tests/fog-wire.test.ts
  - apps/party/tests/result.test.ts
  - apps/party/scripts/measure-4p-timing.ts
  - apps/party/scripts/tsconfig.json
  - apps/web/lib/socket.ts
  - apps/web/lib/identity.ts
  - apps/web/lib/createJoin.ts
  - apps/web/lib/seatRows.ts
  - apps/web/lib/seatRows.test.ts
  - apps/web/lib/matchStore.ts
  - apps/web/lib/uiStore.ts
  - apps/web/lib/board.ts
  - apps/web/lib/board.test.ts
  - apps/web/lib/orderDraft.ts
  - apps/web/lib/orderDraft.test.ts
  - apps/web/lib/format.ts
  - apps/web/lib/format.test.ts
  - apps/web/lib/clock.ts
  - apps/web/lib/clock.test.ts
  - apps/web/lib/stepThrough.ts
  - apps/web/lib/stepThrough.test.ts
  - apps/web/lib/result.ts
  - apps/web/lib/result.test.ts
  - apps/web/components/ui/Button.tsx
  - apps/web/components/home/CreateJoinPanel.tsx
  - apps/web/components/lobby/SeatList.tsx
  - apps/web/components/lobby/CodenameEditor.tsx
  - apps/web/components/lobby/ReadyCountdown.tsx
  - apps/web/components/board/Board.tsx
  - apps/web/components/board/MapNode.tsx
  - apps/web/components/board/MapEdge.tsx
  - apps/web/components/board/AgentToken.tsx
  - apps/web/components/board/TargetOverlay.tsx
  - apps/web/components/orders/OrderComposer.tsx
  - apps/web/components/orders/ActionSlot.tsx
  - apps/web/components/orders/AgentSwitcher.tsx
  - apps/web/components/hud/SubmittedCount.tsx
  - apps/web/components/hud/RoundClock.tsx
  - apps/web/components/hud/LockedInRow.tsx
  - apps/web/components/resolution/StepThrough.tsx
  - apps/web/components/resolution/ResolutionEventRow.tsx
  - apps/web/components/result/ResultScreen.tsx
  - apps/web/app/page.tsx
  - apps/web/app/lobby/[code]/page.tsx
  - apps/web/app/match/[code]/page.tsx
  - apps/web/e2e/home.spec.ts
  - apps/web/e2e/match.spec.ts
  - apps/web/e2e/resolution.spec.ts
  - apps/web/e2e/result.spec.ts
  - apps/web/next.config.ts
  - apps/web/app/globals.css
  - vitest.config.ts
  - playwright.config.ts
  - package.json
  - README.md
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-27T20:02:43Z
**Depth:** standard
**Files Reviewed:** 76
**Status:** issues_found

## Summary

Phase 01 delivers the full create→join→lobby→board→orders→resolution→result loop across `apps/party` and `apps/web`, wired through `packages/shared`'s Zod protocol and `packages/engine`'s pure functions. The overall architecture holds up well against this repo's own constraints: the fog boundary is respected everywhere checked (`projectView()` remains the sole source of client-bound `PlayerView` data, `broadcast.ts` remains the sole outbound path, `OpponentPublicInfo`/`SelfView` shapes are unchanged in the wrong direction), the dependency direction (`shared ← engine ← ai ← apps`) is not violated in any reviewed file, and randomness in `apps/party` consistently flows through the engine's seeded PRNG rather than `Math.random()`/ambient sources. Round-scoped client state (order status, drafts, commit counts) is correctly reset on `ROUND_RESOLVED`, matching a bug the team caught and fixed during Plan 01-06.

The one finding that must block ship is a real, unmitigated authority gap in the room server: **`CREATE` is processed unconditionally regardless of the room's existing state**, so any connection — human, bot-impersonator, or a stray double-send — can silently wipe an active lobby or in-progress match for every other seated player. There is no test covering this path, and the fix is small (an idempotence guard mirroring the one `startMatch()` already has). The remaining findings are lower-severity robustness and UX gaps: bot codenames can collide, a couple of client-side error paths are silently swallowed rather than logged (contrary to this repo's own `apps/web/lib/CLAUDE.md` rule), and a few components lean on documented-but-unenforced assumptions (fixed `ASSUMED_BOARD_PX`, `SEAT_COUNT` literal duplication).

## Critical Issues

### CR-01: `CREATE` clobbers an existing room's state with no idempotence or authorization check

**File:** `apps/party/src/room.ts:109-116`, `apps/party/src/handlers.ts:47-88`
**Issue:** `handleCreate()` unconditionally builds and returns a brand-new `RoomState` from scratch — it takes `roomId`, `codename`, `connectionId`, and `rng` as parameters, but never `this.state`. In `room.ts`'s `onMessage`, the `CREATE` branch calls it with no check on the room's current phase or whether a state already exists:

```ts
if (message.type === 'CREATE') {
  const result = handleCreate(this.room.id, message.codename, sender.id, rng);
  await this.persist(result.state);
  ...
```

Any connection that sends a `CREATE` frame to a room that already has seated players, a running lobby countdown, or an in-progress match (`LOBBY`, `LOADOUT`, `IN_GAME`, even `ENDED`) will silently discard all of it and reseat the sender alone as host of a fresh lobby. This is reachable by:
- A buggy or malicious client sending `CREATE` instead of `JOIN` against a known/guessed join code.
- A raw WebSocket replay or network-level retry of the home page's handshake `CREATE` frame (nothing prevents a duplicate delivery from being processed twice — TCP retransmission of an already-acked frame is not impossible, and PartyKit gives no delivery-once guarantee at this layer).
- Two browsers racing on the exact same freshly-minted code in the (very unlikely but not-impossible) event `newJoinCode()` produces a collision, since there is no uniqueness check against active rooms before minting (the code's own comment concedes this: "Uniqueness is generate-claim-retry scoped to active lobbies... not a database existence check").

This directly contradicts `apps/party/CLAUDE.md` rule 2 ("Validate every inbound message with Zod before it reaches the engine. Clients are untrusted, including your own.") — Zod validates the *shape* of `CREATE` here, but nothing validates that processing it is safe given the room's current state. It is also inconsistent with this same phase's own `startMatch()` in `settings.ts`, which *does* carry an explicit idempotence guard ("returns state unchanged unless still in LOBBY or LOADOUT") specifically to prevent exactly this class of bug for the LOADOUT→IN_GAME transition. No test in `apps/party/tests/` exercises sending `CREATE` twice against the same room, or `CREATE` against a room already `IN_GAME`.
**Fix:**
```ts
// handlers.ts
export function handleCreate(
  state: RoomState | null,
  roomId: string,
  codename: string,
  connectionId: string,
  rng: RngState,
): HandlerResult {
  // Idempotence guard mirroring settings.ts's startMatch(): a room that
  // already has state is never silently reset by a later CREATE.
  if (state) {
    return {
      state,
      toSender: { type: 'ERROR', code: 'ROOM_FULL', message: 'This lobby already exists.' },
      broadcastRoomState: false,
    };
  }
  // ...existing fresh-state construction...
}
```
```ts
// room.ts
if (message.type === 'CREATE') {
  const result = handleCreate(this.state, this.room.id, message.codename, sender.id, rng);
  ...
```
Add a regression test in `apps/party/tests/join.test.ts` asserting a second `CREATE` against a room that already has a seated host is rejected and the original `RoomState` (seats, phase, `gameState`) is left untouched.

## Warnings

### WR-01: Bot codenames are not guaranteed unique, colliding React keys and confusing players

**File:** `apps/party/src/bots.ts:38-53`, `apps/web/components/result/ResultScreen.tsx:41-53`
**Issue:** `fillEmptySeatsWithBots()` draws each open seat's personality independently with replacement (`PERSONALITY_IDS[nextInt(rng, PERSONALITY_IDS.length)]`), and the seat's display codename is `titleCase(personality)` alone (e.g. `"Ghost"`). With 5 personalities (`packages/ai/src/personalities/index.ts`) and up to 4 bot seats filled in a solo/near-solo match, the probability of two bot seats drawing the same personality — and therefore the identical displayed codename — is high (≈80% with 4 independent draws from 5 options). This produces two visible problems: (1) a player cannot visually distinguish two same-named AI opponents in the lobby, HUD (`LockedInRow`), or result screen; (2) `ResultScreen.tsx`'s scoreboard list is keyed by `row.name` (`key={row.name}`), so a collision produces a duplicate React key, which is undefined-behavior-adjacent (React will warn and may misassociate list item identity/state across re-renders). The underlying `playerId` (`bot-${seat.index}-${personality.toLowerCase()}`) is unique, but nothing derived from it is surfaced in the UI to disambiguate.
**Fix:** Disambiguate the display codename when personalities collide, e.g. append the seat index or a short suffix (`"Ghost II"`) when `fillEmptySeatsWithBots` detects a personality already assigned to an earlier seat in the same fill; and change `ResultScreen.tsx`'s list key to a stable identifier from `view.self.id`/`opponents[].id` (already unique) rather than the display name:
```tsx
{rows.map((row, i) => (
  <li key={row.isSelf ? 'self' : `opp-${i}`}>
```

### WR-02: `_new` mint endpoint has no uniqueness check against active rooms

**File:** `apps/party/src/joinCode.ts:29-32`, `apps/party/src/room.ts:77-86`
**Issue:** `newJoinCode()` draws a fresh 6-character code from a 31-symbol alphabet with no check that the code doesn't already name a live room. The code's own doc comment describes this as "generate-claim-retry scoped to active lobbies," but no retry or claim-check is actually implemented anywhere in `onRequest` — it mints and returns a single candidate unconditionally. Combined with CR-01 (CREATE has no idempotence guard), a collision — while statistically rare at ~887M combinations — would silently destroy an existing match rather than being caught and retried.
**Fix:** Either (a) fix CR-01 so a collision is safely rejected instead of destructive, which is the necessary fix regardless, or (b) have the `_new` endpoint actually verify the candidate code against an existing room via a lightweight `parties.match.get(code).fetch()` HEAD/existence check and retry on collision, matching the "claim-retry" behavior the comment already claims exists.

### WR-03: Inbound frame parse failures are dropped silently, contrary to this module's own documented contract

**File:** `apps/web/lib/socket.ts:69-79, 115-121`, `apps/web/app/lobby/[code]/page.tsx` (indirectly, via `useRoomSocket`)
**Issue:** `apps/web/lib/CLAUDE.md` states: "`socket.ts` is the only place that touches the network. One inbound path, Zod-validated. A malformed or unexpected message is dropped **and logged**, never trusted." Both the `handshake()` message listener and `useRoomSocket`'s `onMessage` catch/`safeParse`-failure paths silently `return` with no logging of any kind — a malformed frame, a schema drift between client and server, or a MITM/proxy corruption is invisible to any diagnostic surface (browser console, telemetry, anything). This makes production debugging of a protocol mismatch materially harder than the project's own convention calls for.
**Fix:** Add a minimal `console.warn` (acceptable per `apps/CLAUDE.md`: apps are the only place allowed to touch the network/log) at both drop sites:
```ts
} catch (err) {
  console.warn('[socket] malformed frame, dropped', err);
  return;
}
...
if (!parsed.success) {
  console.warn('[socket] frame failed schema validation, dropped', parsed.error);
  return;
}
```

### WR-04: `handleJoin`'s token-rebind path trusts a bare string-match with no phase or expiry check

**File:** `apps/party/src/handlers.ts:116-135`
**Issue:** A `JOIN` with a `token` matching any seat's `token` field rebinds the sending connection to that seat, regardless of the room's phase (works identically in `LOBBY`, `IN_GAME`, or even `ENDED`) and with no expiry. This is by design for the legitimate lobby-route reconnect flow, but the token itself never expires or rotates, and `bindConnection()` overwrites `connectionId` unconditionally — a second connection presenting the same token (e.g., the same browser tab opened twice, or a token that leaked via a shared/forwarded URL, since tokens are stored in `sessionStorage` and not scoped beyond that) silently steals the seat's live connection binding from whichever connection held it, with no notification to the connection that just got displaced. There's no test exercising "two connections present the same valid token" to establish this is an accepted, understood behavior versus an oversight.
**Fix:** At minimum, document this as an accepted Phase-1 simplification (mirroring the `D-11` "no reconnection handling" note already present for `onClose`), or add a lightweight case in `join.test.ts` asserting the second-connection-wins behavior is intentional. If seat-stealing across tabs proves to be a real support-burden risk in later phases, consider notifying the displaced connection with an `ERROR`/close frame rather than leaving it silently orphaned.

### WR-05: `LockedInRow`'s hardcoded `SLOT_COUNT = 4` will silently mis-render if `SEAT_COUNT` ever changes

**File:** `apps/web/components/hud/LockedInRow.tsx:16-17`
**Issue:** The component comment acknowledges the duplication ("Matches `SEAT_COUNT` in apps/party/src/state.ts") but the value is a locally hardcoded literal, not derived from `view.settings.seats.length` or any shared constant. `apps/party/src/state.ts`'s own comment on `SEAT_COUNT` says "Seat count is fixed at 4 for Phase 1 — host seat-count control is Phase 3," signaling this value is expected to change in a very near-term future phase. When it does, this component will continue rendering exactly 4 slots (some empty, dashed placeholders) regardless of the room's actual seat count, silently producing an incorrect locked-in row rather than a compile error or test failure pointing at this file.
**Fix:** Derive from `view.settings.seats.length` directly (it's already read one line below for the actual seat data) instead of a separate hardcoded constant:
```ts
const slotCount = view.settings.seats.length;
```

## Info

### IN-01: `ActionSlot.describeAction` renders raw `NodeId` values instead of node names

**File:** `apps/web/components/orders/ActionSlot.tsx:16-39`
**Issue:** `MOVE`, `SPRINT`, `WIRETAP`, `DECOY`, and `STRIKE` descriptions interpolate `action.to`/`action.target`/`action.via` directly (e.g. `` `Move → ${action.to}` ``), which renders the raw internal node id (e.g. `karl_marx_allee`) rather than the human-readable node name (`node.name`) shown elsewhere on the board (`MapNode.tsx`). This is cosmetic but inconsistent with the rest of the UI's presentation of node identity.
**Fix:** Thread `view.map` (or a `nodeId → name` lookup) into `ActionSlot`/`describeAction` and render `node.name` instead of the raw id.

### IN-02: `MapNode`'s hit-target circle has `role="button"` but no `tabIndex`, so it isn't independently keyboard-focusable

**File:** `apps/web/components/board/MapNode.tsx:160-169`
**Issue:** Each node's invisible 44px hit-target circle carries `role="button"` and `onClick`, but no `tabIndex`, meaning it cannot receive keyboard focus via Tab — a screen-reader or keyboard-only user relying on standard `role="button"` semantics (rather than the SVG-root arrow-key scheme `Board.tsx` implements) has no way to reach an individual node by tabbing. `apps/web/CLAUDE.md` rule 4 states "The board is keyboard-navigable and every signal has a text form," which the arrow-key scheme satisfies for sighted keyboard users, but the `role="button"` on a non-focusable element is a minor a11y inconsistency (a screen reader may announce it as an interactive control that cannot actually be activated via its own expected interaction pattern).
**Fix:** Either drop `role="button"` from the per-node hit circle (since the actual interactive/focusable element is the parent `<svg>`), or add `tabIndex={-1}` explicitly to document that it's intentionally excluded from the tab order.

### IN-03: `randomLocalId()`'s non-`crypto.randomUUID` fallback seeds from `Date.now()`, a low-entropy source

**File:** `apps/web/lib/identity.ts:88-96`
**Issue:** When `crypto.randomUUID` is unavailable, `randomLocalId()` falls back to `seedRng(String(Date.now()))`, which has millisecond-granularity entropy — two identities generated by two different browser sessions/tabs within the same millisecond (unlikely but not impossible for a fallback path with no other guard) would receive an identical local `playerId`. This is a fallback-only path (all evergreen browsers support `crypto.randomUUID`) and `playerId` here is a local storage convenience value, not a security token, so impact is low.
**Fix:** If retained, mix in an additional per-call counter or `Math.random()`-independent jitter source; alternatively, this fallback branch may not be worth maintaining at all given `crypto.randomUUID` support is effectively universal.

---

_Reviewed: 2026-08-27T20:02:43Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
