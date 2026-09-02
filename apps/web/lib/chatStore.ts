import { create } from 'zustand';
import type { ChatMessage, ChatScope } from '@berlin/shared';

/**
 * Holds both chat scopes in one store — LOBBY and MATCH are one concern
 * (chat), and D-10's separation is the shape of the data (two keyed arrays),
 * not a reason to split into two Zustand stores. Session/UI-only, per
 * apps/web/CLAUDE.md rule 5. Modelled on matchStore.ts's conventions.
 */
interface ChatStore {
  readonly messages: Record<ChatScope, ChatMessage[]>;
  /** Count of CHAT_MESSAGE frames received since the last markRead() —
   *  drives the match chat toggle's collapsed unread badge. Incremented by
   *  append, not by replace: a CHAT_HISTORY catch-up on join/reconnect is
   *  not a new "unread" event. */
  readonly unread: number;
  append: (scope: ChatScope, message: ChatMessage) => void;
  /** Overwrites one scope's array wholesale — the CHAT_HISTORY catch-up
   *  path. Leaves the other scope untouched. */
  replace: (scope: ChatScope, messages: readonly ChatMessage[]) => void;
  markRead: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: { LOBBY: [], MATCH: [] },
  unread: 0,
  append: (scope, message) =>
    set((s) => ({
      messages: { ...s.messages, [scope]: [...s.messages[scope], message] },
      unread: s.unread + 1,
    })),
  replace: (scope, messages) =>
    set((s) => ({ messages: { ...s.messages, [scope]: [...messages] } })),
  markRead: () => set({ unread: 0 }),
}));
