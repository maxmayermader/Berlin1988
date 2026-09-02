'use client';

import { CHAT_TEXT_MAX } from '@berlin/shared';
import type { ChatMessage } from '@berlin/shared';
import { useState } from 'react';
import { useChatStore } from '../../lib/chatStore.js';
import { ChatBody } from '../lobby/ChatPanel.js';
import { Button } from '../ui/Button.js';

/**
 * The match page's tertiary chat surface (CHAT-02, D-10) — collapsed by
 * default in a fixed bottom-right corner (03-UI-SPEC.md Visual Hierarchy:
 * never competes with the Board/Orders split for space). Reuses ChatPanel's
 * exported ChatBody for the message list, so the list-and-composer markup
 * is never duplicated between the lobby and match surfaces. No motion on the
 * expand or the unread badge — POLISH-01's transition pass is Phase 4.
 */

const COLLAPSED_LABEL = 'Chat';
const EXPANDED_TITLE = 'Table Talk';
const PLACEHOLDER = 'Say something…';
const SEND_LABEL = 'Send Message';

export interface MatchChatProps {
  messages: readonly ChatMessage[];
  onSend: (text: string) => void;
  pending?: boolean;
  error?: string | null;
}

export function MatchChat({ messages, onSend, pending = false, error = null }: MatchChatProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const unread = useChatStore((s) => s.unread);
  const markRead = useChatStore((s) => s.markRead);
  const canSend = draft.trim().length > 0;

  function handleExpand() {
    setExpanded(true);
    markRead();
  }

  function handleSend() {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft('');
  }

  if (!expanded) {
    return (
      <div className="fixed bottom-4 right-4">
        <button
          type="button"
          onClick={handleExpand}
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-[#e2e8f0] bg-[#ffffff] px-4 py-2 text-base font-semibold"
        >
          {COLLAPSED_LABEL}
          {unread > 0 && (
            <span className="rounded-full bg-[#2563eb] px-2 text-sm text-white">{unread}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 flex h-96 w-80 flex-col gap-4 rounded border border-[#e2e8f0] bg-[#ffffff] p-6 shadow">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold leading-[1.2]">{EXPANDED_TITLE}</h2>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Collapse"
          className="min-h-11 min-w-11 text-sm text-[#64748b]"
        >
          ×
        </button>
      </div>
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
    </div>
  );
}
