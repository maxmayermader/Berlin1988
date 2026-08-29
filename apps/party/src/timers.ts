import { nextInt } from '@berlin/engine';
import type { RngState } from '@berlin/shared';
import { closeRound } from './round.js';
import type { RoomState } from './state.js';

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
