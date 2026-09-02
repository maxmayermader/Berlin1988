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
  append: (scope: ChatScope, message: ChatMessage) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: { LOBBY: [], MATCH: [] },
  append: (scope, message) =>
    set((s) => ({ messages: { ...s.messages, [scope]: [...s.messages[scope], message] } })),
}));
