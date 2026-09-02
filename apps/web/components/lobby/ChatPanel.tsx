'use client';

import { CHAT_TEXT_MAX } from '@berlin/shared';
import type { ChatMessage } from '@berlin/shared';
import { useState } from 'react';
import { Button } from '../ui/Button.js';

/**
 * "Table Talk" — the lobby's free-text + flavor-prompt chat panel
 * (CHAT-01, D-10/D-11/D-12). A secondary section on the lobby page,
 * rendered below the existing seat/ready content (03-UI-SPEC.md Visual
 * Hierarchy: chat never competes with seat scanning). The match page's
 * MatchChat wraps this same list-and-composer body inside its own
 * collapsed-by-default drawer chrome.
 */

const TITLE = 'Table Talk';
const PLACEHOLDER = 'Say something…';
const SEND_LABEL = 'Send Message';
const EMPTY_COPY = 'No messages yet. Say hello, or pick a line below.';

export interface ChatPanelProps {
  messages: readonly ChatMessage[];
  onSend: (text: string) => void;
  pending?: boolean;
  error?: string | null;
}

export function ChatPanel({ messages, onSend, pending = false, error = null }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const canSend = draft.trim().length > 0;

  function handleSend() {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft('');
  }

  return (
    <section className="flex flex-col gap-4 rounded border border-[#e2e8f0] bg-[#ffffff] p-6">
      <h2 className="text-[20px] font-semibold leading-[1.2]">{TITLE}</h2>
      <ChatBody messages={messages} />
      {error && <p className="text-sm text-[#dc2626]">{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={PLACEHOLDER}
          maxLength={CHAT_TEXT_MAX}
          className="flex-1 rounded border border-[#e2e8f0] px-3 py-2 text-base focus:border-[#2563eb]"
        />
        <Button onClick={handleSend} pending={pending} disabled={!canSend}>
          {SEND_LABEL}
        </Button>
      </div>
    </section>
  );
}

/**
 * The message list — extracted so MatchChat.tsx can render the identical
 * scrolling body inside its own fixed-height drawer chrome, without a second
 * copy of the message-row markup (03-03-PLAN.md Task 2).
 */
export function ChatBody({ messages }: { messages: readonly ChatMessage[] }) {
  return (
    <div className="flex h-48 flex-col gap-2 overflow-y-auto rounded border border-[#e2e8f0] bg-[#f1f5f9] p-4">
      {messages.length === 0 ? (
        <p className="text-sm text-[#64748b]">{EMPTY_COPY}</p>
      ) : (
        messages.map((message) => (
          <div key={message.id}>
            <p className="text-sm font-semibold">{message.codename}</p>
            <p className="text-base">{message.text}</p>
          </div>
        ))
      )}
    </div>
  );
}
