import type { ChatMessage } from '@berlin/shared';

/**
 * The chat panel's pure view model — copy constants and the client-side send
 * gate, no React. Follows seatRows.ts's conventions exactly (readonly
 * interface, exported copy constants, no React import) — this is where
 * these rules become unit-testable at all, since this phase ships no React
 * component-testing stack (01-02-PLAN.md's precedent).
 */

export const EMPTY_COPY = 'No messages yet. Say hello, or pick a line below.';
export const PLACEHOLDER_COPY = 'Say something…';
export const SEND_LABEL = 'Send Message';
export const PROMPTS_LABEL = 'Prompts';
export const REJECTED_COPY = 'Message not sent — try again.';

export interface ChatRow {
  readonly key: string;
  readonly codename: string;
  readonly text: string;
}

/** One row per message, in argument order — oldest first, so the caller
 *  renders newest-at-bottom without re-sorting. `key` is the message's own
 *  id, so React's list-key identity matches the message's identity exactly. */
export function chatRows(messages: readonly ChatMessage[]): ChatRow[] {
  return messages.map((message) => ({
    key: message.id,
    codename: message.codename,
    text: message.text,
  }));
}

/**
 * The client-side send gate — whether the trimmed draft is non-empty. UX
 * only; mirrors how the deckbuilder's own gate sits in front of the room's
 * authoritative check (handleChatSend re-validates independently).
 */
export function canSend(draft: string): boolean {
  return draft.trim().length > 0;
}
