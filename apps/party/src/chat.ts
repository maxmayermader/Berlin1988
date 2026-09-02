import type { ChatMessage, ChatScope } from '@berlin/shared';
import type { RoomPhase, RoomState } from './state.js';

/**
 * The chat log's per-scope cap. The log lives in Durable Object storage and
 * is persisted on every mutation, so an uncapped log is unbounded storage
 * growth and an unbounded persist cost on every message (T-03-16).
 */
export const CHAT_LOG_LIMIT = 100;

/**
 * Maps a RoomState.phase to the chat scope a message sent right now belongs
 * to. The single function that makes D-10's lobby/match separation a
 * property of the phase machine rather than a convention two call sites
 * (handleChatSend, handleJoin's catch-up) could drift on.
 */
export function chatScopeFor(phase: RoomPhase): ChatScope {
  return phase === 'LOBBY' || phase === 'LOADOUT' ? 'LOBBY' : 'MATCH';
}

export function chatLogFor(state: RoomState, scope: ChatScope): readonly ChatMessage[] {
  return state.chat[scope];
}

/**
 * Appends `message` to its own scope's log, immutably, trimmed from the
 * front to CHAT_LOG_LIMIT — following state.ts's clone-modify-return idiom
 * exactly. The other scope's array is untouched (D-10).
 */
export function appendChat(state: RoomState, message: ChatMessage): RoomState {
  const nextLog = [...state.chat[message.scope], message].slice(-CHAT_LOG_LIMIT);
  return {
    ...state,
    chat: { ...state.chat, [message.scope]: nextLog },
  };
}
