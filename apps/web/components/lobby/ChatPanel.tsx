'use client';

import { CHAT_TEXT_MAX, FLAVOR_PROMPTS } from '@berlin/shared';
import type { ChatMessage } from '@berlin/shared';
import { useState } from 'react';
import {
  canSend,
  chatRows,
  EMPTY_COPY,
  PLACEHOLDER_COPY,
  PROMPTS_LABEL,
  SEND_LABEL,
} from '../../lib/chatRows.js';
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

export interface ChatPanelProps {
  messages: readonly ChatMessage[];
  onSend: (text: string) => void;
  onSendPrompt: (promptId: number) => void;
  pending?: boolean;
  error?: string | null;
}

export function ChatPanel({
  messages,
  onSend,
  onSendPrompt,
  pending = false,
  error = null,
}: ChatPanelProps) {
  return (
    <section className="flex flex-col gap-4 rounded border border-[#e2e8f0] bg-[#ffffff] p-6">
      <h2 className="text-[20px] font-semibold leading-[1.2]">{TITLE}</h2>
      <ChatBody messages={messages} />
      {error && <p className="text-sm text-[#dc2626]">{error}</p>}
      <ChatComposer onSend={onSend} onSendPrompt={onSendPrompt} pending={pending} />
    </section>
  );
}

/**
 * The message list — extracted so MatchChat.tsx can render the identical
 * scrolling body inside its own fixed-height drawer chrome, without a second
 * copy of the message-row markup (03-03-PLAN.md Task 2). Renders
 * chatRows(messages) rather than mapping raw messages — the pure view model
 * owns row shape, this component decides nothing.
 */
export function ChatBody({ messages }: { messages: readonly ChatMessage[] }) {
  const rows = chatRows(messages);
  return (
    <div className="flex h-48 flex-col gap-2 overflow-y-auto rounded border border-[#e2e8f0] bg-[#f1f5f9] p-4">
      {rows.length === 0 ? (
        <p className="text-sm text-[#64748b]">{EMPTY_COPY}</p>
      ) : (
        rows.map((row) => (
          <div key={row.key}>
            <p className="text-sm font-semibold">{row.codename}</p>
            <p className="text-base">{row.text}</p>
          </div>
        ))
      )}
    </div>
  );
}

export interface ChatComposerProps {
  onSend: (text: string) => void;
  onSendPrompt: (promptId: number) => void;
  pending?: boolean;
}

/**
 * The input + Send button + flavor-prompt picker — extracted so MatchChat.tsx
 * never declares its own copy of the prompt list or the composer markup
 * (Task 3 acceptance criteria). Clicking a chip immediately sends its full
 * predefined text and closes the picker — there is no staged or partial
 * prompt state.
 */
export function ChatComposer({ onSend, onSendPrompt, pending = false }: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const [promptsOpen, setPromptsOpen] = useState(false);

  function handleSend() {
    if (!canSend(draft)) return;
    onSend(draft.trim());
    setDraft('');
  }

  function handlePromptClick(index: number) {
    onSendPrompt(index);
    setPromptsOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={PLACEHOLDER_COPY}
          maxLength={CHAT_TEXT_MAX}
          className="flex-1 rounded border border-[#e2e8f0] px-3 py-2 text-base focus:border-[#2563eb]"
        />
        <Button
          variant="ghost"
          onClick={() => setPromptsOpen((open) => !open)}
          aria-pressed={promptsOpen}
        >
          {PROMPTS_LABEL}
        </Button>
        <Button onClick={handleSend} pending={pending} disabled={!canSend(draft)}>
          {SEND_LABEL}
        </Button>
      </div>
      {promptsOpen && (
        <div className="flex flex-wrap gap-2">
          {FLAVOR_PROMPTS.map((prompt, index) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handlePromptClick(index)}
              className="rounded border border-[#2563eb] px-3 py-1 text-sm text-[#2563eb]"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
