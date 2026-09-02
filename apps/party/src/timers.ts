import { nextInt } from '@berlin/engine';
import type { RngState } from '@berlin/shared';
import { closeRound } from './round.js';
import type { DisconnectedSeat, RoomState } from './state.js';

/**
 * Durable Object alarm scheduling for the round deadline (D-04's 90s),
 * auto-Hold on expiry, and bot submission padding. Every wall-clock read
 * lives in apps/party/src/room.ts and is passed in here as `now` — these
 * transition functions are pure and testable without fake timers
 * (apps/party/src/CLAUDE.md rule 9; 01-RESEARCH.md Pitfall 3).
 */

/**
 * Sets RoomState.deadlineAt to `now + settings.roundTimerSeconds * 1000` —
 * an absolute server timestamp, never a remaining duration, so the exact
 * same number is sent to every connection. Write-once per round:
 * `deadlineRound` already equalling the current round number is what stops
 * a late join, a codename change, or a re-broadcast from silently
 * extending or restarting a running countdown, which would make the
 * visible timer jump backwards.
 */
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

/**
 * The Durable Object alarm firing for a round deadline. `now < deadlineAt`
 * means this is a stale or duplicate delivery of an alarm event whose
 * round has already moved on (or whose deadline hasn't genuinely arrived
 * yet) — a no-op, which is what makes two alarm fires for the same
 * scheduled time resolve exactly once. Otherwise delegates to
 * closeRound('DEADLINE'), whose own phase guard is the second half of that
 * protection: resolveRound() runs exactly once for a given round no matter
 * how the two guards combine. If the room is still IN_GAME afterward, the
 * next round's deadline is scheduled; if the match just ended, nothing is.
 */
export function onRoundAlarm(state: RoomState, now: number): RoomState {
  if (state.deadlineAt === null || now < state.deadlineAt) return state;

  const closed = closeRound(state, 'DEADLINE');
  if (closed.phase !== 'IN_GAME') return closed;
  return scheduleRoundDeadline(closed, now);
}

/**
 * Bot submission padding — docs/ARCHITECTURE.md §7's existing 1500-4000ms
 * tuning target, not a new number. packages/ai answers at p99 under 50ms
 * (01-RESEARCH.md Pitfall 6); an unpadded bot would announce itself the
 * instant the round opens and would also race round-start bookkeeping.
 */
export function botDelayMs(rng: RngState): number {
  return 1500 + nextInt(rng, 2501);
}

/**
 * Disconnect-grace scheduling (D-07, Task 2). None of the three functions
 * below may read or write `deadlineAt` or `deadlineRound` — a grace entry
 * is purely additive, only ever an extra candidate in room.ts's
 * `alarmTarget()` Math.min. This is prohibition P-3-03: a clock any client
 * could stop by closing its own socket is the exact griefing vector
 * apps/party/CLAUDE.md rule 4 already forbids for the pause poll, reached
 * here through a different door (an unattended disconnect rather than an
 * explicit pause request). Nothing here schedules a real timer either —
 * apps/party/CLAUDE.md rule 4/"the room owns time" and 01-RESEARCH.md
 * Pitfall 1 both apply: every timer routes through room.storage.setAlarm()
 * via syncAlarm, never setTimeout/setInterval.
 */

/**
 * Adds one grace entry for `seatIndex`, expiring at `now + durationMs`.
 * Write-once, mirroring scheduleRoundDeadline's own discipline: if an entry
 * for this seat index already exists, returns `state` unchanged BY
 * REFERENCE, so a duplicated close event (e.g. two onClose deliveries for
 * the same dead connection) can never extend an already-running grace
 * window. Also a no-op — again by reference — for a seat with no
 * `playerId` or whose `kind` is `OPEN`: there is no one to hold a seat open
 * for.
 */
export function scheduleDisconnectGrace(
  state: RoomState,
  seatIndex: number,
  now: number,
  durationMs: number,
): RoomState {
  const seat = state.seats.find((s) => s.index === seatIndex);
  if (!seat || !seat.playerId || seat.kind === 'OPEN') return state;
  if (state.disconnectedSeats.some((d) => d.seatIndex === seatIndex)) return state;

  const entry: DisconnectedSeat = {
    seatIndex,
    playerId: seat.playerId,
    graceExpiresAt: now + durationMs,
  };
  return { ...state, disconnectedSeats: [...state.disconnectedSeats, entry] };
}

/** Removes only the grace entry for `seatIndex`, leaving every other entry
 *  untouched — the D-07 silent-reclaim path (handleJoin's token-rebind
 *  branch) and the D-08 takeover path (Task 3's takeOverSeat/reclaimSeat)
 *  both call this once a seat's control mode has been settled one way or
 *  the other. A no-op — by reference — when no entry exists for that seat. */
export function clearDisconnectGrace(state: RoomState, seatIndex: number): RoomState {
  if (!state.disconnectedSeats.some((d) => d.seatIndex === seatIndex)) return state;
  return {
    ...state,
    disconnectedSeats: state.disconnectedSeats.filter((d) => d.seatIndex !== seatIndex),
  };
}

/** Every grace entry whose `graceExpiresAt` is at or before `now` — the
 *  set room.ts's onAlarm folds through Task 3's `takeOverSeat` on every
 *  firing, in both LOBBY/LOADOUT and IN_GAME. Returns an empty array, never
 *  undefined, when nothing has expired. */
export function expiredGraceSeats(state: RoomState, now: number): readonly DisconnectedSeat[] {
  return state.disconnectedSeats.filter((d) => d.graceExpiresAt <= now);
}
