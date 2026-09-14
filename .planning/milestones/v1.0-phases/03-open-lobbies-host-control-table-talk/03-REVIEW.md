---
phase: 03-open-lobbies-host-control-table-talk
reviewed: 2026-09-02T00:00:00Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - apps/party/partykit.json
  - apps/party/src/bots.ts
  - apps/party/src/broadcast.ts
  - apps/party/src/chat.ts
  - apps/party/src/directory.ts
  - apps/party/src/directoryClient.ts
  - apps/party/src/handlers.ts
  - apps/party/src/readout.ts
  - apps/party/src/room.ts
  - apps/party/src/settings.ts
  - apps/party/src/state.ts
  - apps/party/src/timers.ts
  - apps/party/tests/botfill.test.ts
  - apps/party/tests/chat.test.ts
  - apps/party/tests/clock.test.ts
  - apps/party/tests/directory.test.ts
  - apps/party/tests/disconnect.test.ts
  - apps/party/tests/fog-wire.test.ts
  - apps/party/tests/helpers.ts
  - apps/party/tests/kick.test.ts
  - apps/party/tests/loadout.test.ts
  - apps/party/tests/lobby.test.ts
  - apps/party/tests/seatcount.test.ts
  - apps/party/tests/takeover.test.ts
  - apps/web/app/lobby/[code]/page.tsx
  - apps/web/app/match/[code]/page.tsx
  - apps/web/app/page.tsx
  - apps/web/components/home/KickedBanner.tsx
  - apps/web/components/home/OpenLobbies.tsx
  - apps/web/components/lobby/ChatPanel.tsx
  - apps/web/components/lobby/SeatList.tsx
  - apps/web/components/match/MatchChat.tsx
  - apps/web/components/ui/Banner.tsx
  - apps/web/lib/chatRows.test.ts
  - apps/web/lib/chatRows.ts
  - apps/web/lib/chatStore.test.ts
  - apps/web/lib/chatStore.ts
  - apps/web/lib/directorySocket.ts
  - apps/web/lib/kicked.test.ts
  - apps/web/lib/kicked.ts
  - apps/web/lib/lobbyList.test.ts
  - apps/web/lib/lobbyList.ts
  - apps/web/lib/matchChatMount.test.ts
  - apps/web/lib/seatRows.test.ts
  - apps/web/lib/seatRows.ts
  - apps/web/lib/socket.ts
  - packages/shared/src/index.ts
  - packages/shared/src/prompts.ts
  - packages/shared/src/protocol.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 39 (some test files listed in scope do not exist in the repo yet — see note)
**Status:** issues_found

## Summary

Reviewed the Phase 3 directory/host-control/table-talk/reconnect implementation across `apps/party`, `apps/web`, and the `packages/shared` protocol. The overall design is careful: fog boundaries are respected, host-only actions are authorized against the connection's bound seat rather than message content, and the reclaim/takeover race (a stale bot submission overwriting a reconnecting human's order) that this phase's own commit history references is genuinely fixed via `reclaimSeat`'s atomic `botSubmissions` purge.

The one blocking defect is a gap in that same seat-lifecycle bookkeeping: `handleKick` vacates a seat without clearing any live disconnect-grace entry for it, which can leave a permanently-expired alarm target in `RoomState.disconnectedSeats` — driving `onAlarm` into an effectively unbounded busy loop for that room, and briefly mislabeling a freshly-reopened seat as "disconnected" on the wire. Two warnings follow from robustness gaps in directory staleness and shared-copy handling. One info-level note covers a UX-only nit.

Note: `apps/party/tests/botfill.test.ts`, `clock.test.ts`, `fog-wire.test.ts`, `loadout.test.ts`, and `lobby.test.ts` were listed for review but were not directly read at standard depth beyond confirming their presence via directory listing during exploration — `kick.test.ts`, `disconnect.test.ts`, `takeover.test.ts`, `seatcount.test.ts`, `directory.test.ts`, and `chat.test.ts` (the files most relevant to this phase's new behavior) were read in full and are what CR-01 below is verified against (no test in that set exercises kicking a mid-grace-period seat).

## Critical Issues

### CR-01: Kicking a disconnected seat leaves a permanently-expired disconnect-grace entry, causing an unbounded alarm re-fire loop

**File:** `apps/party/src/handlers.ts:392-394` (`handleKick`), `apps/party/src/state.ts:322-329` (`vacateSeat`)

**Issue:**

`handleKick` removes an occupied seat via `vacateSeat`:

```ts
const kickedConnectionId = target.connectionId;
const next = recomputeCountdown(vacateSeat(state, seatIndex), now, COUNTDOWN_DURATION_MS);
return { state: next, toSender: null, kickedConnectionId };
```

`vacateSeat` resets the target seat back to its `OPEN` shape (`apps/party/src/state.ts:322-329`) but does not touch `RoomState.disconnectedSeats`. If the host kicks a seat that is currently mid disconnect-grace-window (D-07: the player dropped, `onClose` scheduled a `DisconnectedSeat` entry with a `graceExpiresAt`, and the grace hasn't expired or been cleared yet), that entry survives the kick and now points at a seat that is `OPEN`.

Two concrete consequences:

1. **Alarm busy-loop.** `apps/party/src/room.ts`'s `alarmTarget()` (line 514-525) always includes every entry in `state.disconnectedSeats` as a candidate, regardless of phase or seat kind. Once `graceExpiresAt` is in the past, `onAlarm` fires, calls `applyExpiredTakeovers` → `takeOverSeat(state, seatIndex, rng)` for that seat — but `takeOverSeat` (`apps/party/src/bots.ts:127-141`) explicitly no-ops (returns `state` unchanged, by reference) when `seat.kind === 'OPEN'`:
   ```ts
   if (!seat || !seat.playerId || seat.kind === 'OPEN' || seat.controlledBy === 'AI') return state;
   ```
   Because it's a no-op, the stale `disconnectedSeats` entry is never removed. `alarmTarget()` then keeps returning that same past timestamp as the minimum candidate on every subsequent call, so `syncAlarm` reschedules the Durable Object alarm to fire (almost) immediately, forever — an indefinite tight alarm loop for the lifetime of the room, with no way for the room to self-heal (unlike the directory-push self-heal, there's no other code path that clears this entry).

2. **Snapshot mislabeling.** `toSnapshot()` (`apps/party/src/state.ts:374-392`) derives `disconnected` for the wire straight from `disconnectedSeats` membership by seat index: `disconnectedIndices.has(seat.index)`. A later player joining that now-`OPEN`-then-refilled seat index would briefly render with `disconnected: true` on the very next `ROOM_STATE` frame the room has computed before the (never-arriving) clear — actually worse, since the entry never clears, every future occupant of that seat index is shown as disconnected until the room somehow reschedules that index's grace via a fresh `onClose` (which will itself be a no-op per `scheduleDisconnectGrace`'s write-once guard, since a stale entry for that index already "exists"). `apps/web/lib/seatRows.ts` happens to mask this for a genuinely-OPEN seat (its `kind === 'OPEN'` branch returns before checking `disconnected`), but a subsequently-filled HUMAN/BOT seat at that same index would surface it directly as `RECONNECTING` (or be blocked from ever getting its own grace entry).

**Fix:** Clear the grace entry as part of the same kick transition, mirroring how `takeOverSeat`/`reclaimSeat` already do this atomically in `bots.ts`:

```ts
import { clearDisconnectGrace } from './timers.js';
// ...
const kickedConnectionId = target.connectionId;
const next = recomputeCountdown(
  clearDisconnectGrace(vacateSeat(state, seatIndex), seatIndex),
  now,
  COUNTDOWN_DURATION_MS,
);
return { state: next, toSender: null, kickedConnectionId };
```

(`clearDisconnectGrace` is already exported from `apps/party/src/timers.ts:111-117` and is a by-reference no-op when no entry exists, so this is safe to call unconditionally.) Add a regression test alongside the existing `kick.test.ts` suite: schedule a grace entry for a seat (via `onClose` or directly via `scheduleDisconnectGrace`), kick that seat, and assert `disconnectedSeats` no longer contains an entry for that index.

## Warnings

### WR-01: Directory entries have no TTL — a room that dies before reaching IN_GAME or sending another message leaves a permanently-stale public lobby listing

**File:** `apps/party/src/directoryClient.ts:22-32`, `apps/party/src/directory.ts`

**Issue:** `syncDirectory`'s self-heal comment (`apps/party/src/directoryClient.ts:17-20`) explicitly relies on a later inbound message reaching the room (SUBMIT_ORDER is called out as the specific self-heal path) to retry a failed `REMOVE`. If a room's Durable Object is abandoned in LOBBY/LOADOUT — e.g. every player closes their tab and no one ever sends another message, or the process crashes between an `UPSERT` and ever reaching `IN_GAME` — there is no further message to trigger a retry, and no TTL/expiry on `LobbyDirectory`'s stored entries (`apps/party/src/directory.ts:26` — a plain `Map`, persisted forever via `persist()`). The lobby then shows up in `OpenLobbies` indefinitely, and a joiner clicking it gets a `ROOM_FULL`/`UNKNOWN_CODE`-shaped dead end (or, if the Durable Object is still cold-startable, a working but abandoned room).

**Fix:** Out of scope to fully solve here, but worth tracking: either have `LobbyDirectory` expire entries older than some bound (e.g. drop any entry not refreshed within N minutes, requiring rooms to periodically re-`UPSERT` even with no state change), or accept this as a known Phase-3 limitation and document it explicitly in `docs/ARCHITECTURE.md` / a follow-up phase rather than leaving it only in a code comment.

### WR-02: `handleKick`'s vacated seat still counts toward `minSeatCount`/countdown math using stale `disconnectedSeats` data if CR-01 is fixed only partially

**File:** `apps/party/src/state.ts:246-264` (`minSeatCount`), `apps/party/src/handlers.ts:338-395` (`handleKick`)

**Issue:** This is a secondary correctness note tied to CR-01: `minSeatCount()` walks `state.seats` for `kind !== 'OPEN'` to compute the shrink floor, and is correct once CR-01's fix lands (a kicked seat's `kind` already flips to `OPEN` via `vacateSeat`, independent of `disconnectedSeats`). No separate action needed beyond CR-01's fix, but callers modifying `handleKick` in the future should be aware that `disconnectedSeats` is a *second* source of "is this seat still meaningfully occupied" truth that isn't consulted by `minSeatCount`/`canSetSeatCount` at all — so a stale `disconnectedSeats` entry (pre-fix) doesn't block a seat-count shrink, only the alarm scheduling. Flagging so a future refactor doesn't assume `disconnectedSeats` membership implies occupancy.

## Info

### IN-01: `SeatList.tsx` uses the native `window.confirm` for the kick confirmation dialog

**File:** `apps/web/components/lobby/SeatList.tsx:37-40`

**Issue:** `handleKickClick` gates the KICK send behind `window.confirm(...)`, a blocking, unstyled native browser dialog that breaks from the rest of the app's design system (`ui/` primitives elsewhere in this phase — `Banner.tsx`, `Button.tsx`) and cannot be disabled/customized for reduced-motion or CRT-theme consistency per `apps/web/CLAUDE.md` rule 4's accessibility bar. Not a functional bug — it does correctly gate the destructive action — but worth a follow-up to replace with an in-system confirm component when one exists.

**Fix:** Track as a follow-up UI polish item rather than blocking this phase; no code change required now.

---

_Reviewed: 2026-09-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
