import { allCommitted, autoHoldMissing, resolveRound } from '@berlin/engine';
import type { RoomState } from './state.js';

/**
 * True once every living agent across every seat has committed its order.
 * The sole trigger for closing a round early, ahead of the deadline —
 * apps/party/src/handlers.ts checks this after every accepted SUBMIT_ORDER.
 */
export function shouldCloseRound(state: RoomState): boolean {
  return state.phase === 'IN_GAME' && state.gameState !== null && allCommitted(state.gameState);
}

/**
 * The only resolveRound() call site in the repo outside packages/
 * (apps/party/src/CLAUDE.md rule 3). Returns `state` unchanged unless the
 * room is IN_GAME with a live GameState whose phase is still 'ORDERS' —
 * that guard is what makes a double-fired alarm, a duplicated message, or a
 * late submission landing mid-close a no-op rather than a second resolution
 * of the same round.
 *
 * On the 'DEADLINE' path, autoHoldMissing runs first so every uncommitted
 * live agent banks Intel via a Hold rather than being treated as absent.
 */
export function closeRound(state: RoomState, reason: 'ALL_COMMITTED' | 'DEADLINE'): RoomState {
  if (state.phase !== 'IN_GAME' || !state.gameState || state.gameState.phase !== 'ORDERS') {
    return state;
  }

  const pre = reason === 'DEADLINE' ? autoHoldMissing(state.gameState) : state.gameState;
  const { state: resolved } = resolveRound(pre);

  return {
    ...state,
    phase: resolved.outcome !== null ? 'ENDED' : state.phase,
    gameState: resolved,
  };
}
