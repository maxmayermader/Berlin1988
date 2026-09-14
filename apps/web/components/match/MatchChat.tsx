'use client';

import type { ChatMessage } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useChatStore } from '../../lib/chatStore.js';
import { fadeSlideUpVariant, HOVER_TRANSITION_CLASS } from '../../lib/motion.js';
import { ChatBody, ChatComposer } from '../lobby/ChatPanel.js';

/**
 * The match page's tertiary chat surface (CHAT-02, D-10) — collapsed by
 * default in a fixed bottom-right corner (03-UI-SPEC.md Visual Hierarchy:
 * never competes with the Board/Orders split for space). Reuses ChatPanel's
 * exported ChatBody and ChatComposer (message list, input, Send button, and
 * the flavor-prompt picker) so neither the message-list markup nor the
 * prompt list is ever duplicated between the lobby and match surfaces
 * (Task 3 acceptance criteria). Expand/collapse routes through the shared
 * motion utility (04-UI-SPEC.md Motion Contract item 5).
 */

const COLLAPSED_LABEL = 'Chat';
const EXPANDED_TITLE = 'Table Talk';

export interface MatchChatProps {
  messages: readonly ChatMessage[];
  onSend: (text: string) => void;
  onSendPrompt: (promptId: number) => void;
  pending?: boolean;
  error?: string | null;
}

export function MatchChat({
  messages,
  onSend,
  onSendPrompt,
  pending = false,
  error = null,
}: MatchChatProps) {
  const [expanded, setExpanded] = useState(false);
  const unread = useChatStore((s) => s.unread);
  const markRead = useChatStore((s) => s.markRead);
  const reducedMotion = useReducedMotion();

  function handleExpand() {
    setExpanded(true);
    markRead();
  }

  if (!expanded) {
    return (
      <div className="fixed bottom-4 right-4">
        <button
          type="button"
          onClick={handleExpand}
          className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-[#e2e8f0] bg-[#ffffff] px-4 py-2 text-base font-semibold hover:bg-[#f1f5f9] ${HOVER_TRANSITION_CLASS}`}
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
    <motion.div
      {...fadeSlideUpVariant(reducedMotion)}
      className="fixed bottom-4 right-4 flex h-96 w-80 flex-col gap-4 rounded border border-[#e2e8f0] bg-[#ffffff] p-6 shadow"
    >
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
      <ChatComposer onSend={onSend} onSendPrompt={onSendPrompt} pending={pending} />
    </motion.div>
  );
}
