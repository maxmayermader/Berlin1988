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
      <div className="fixed bottom-4 right-4 z-30">
        <button
          type="button"
          onClick={handleExpand}
          className={`manila flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[3px] px-4 py-2 font-display text-base shadow-sheet hover:bg-manila-2 ${HOVER_TRANSITION_CLASS}`}
        >
          {COLLAPSED_LABEL}
          {unread > 0 && (
            <span className="rounded-full bg-stamp px-2 font-type text-sm font-bold text-paper">{unread}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <motion.div
      {...fadeSlideUpVariant(reducedMotion)}
      className="manila fixed bottom-4 right-4 z-30 flex h-[28rem] max-h-[80dvh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-[4px] p-5 shadow-sheet"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl leading-none">{EXPANDED_TITLE}</h2>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Collapse"
          className="min-h-11 min-w-11 text-sm text-ink-muted"
        >
          ×
        </button>
      </div>
      <ChatBody messages={messages} />
      {error && <p className="text-sm text-stamp">{error}</p>}
      <ChatComposer onSend={onSend} onSendPrompt={onSendPrompt} pending={pending} />
    </motion.div>
  );
}
