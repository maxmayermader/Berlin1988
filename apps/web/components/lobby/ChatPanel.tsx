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
    <section className="manila flex flex-col gap-3 rounded-[4px] p-5 shadow-sheet">
      <h2 className="font-display text-xl leading-none">{TITLE}</h2>
      <ChatBody messages={messages} />
      {error && <p className="text-sm text-stamp">{error}</p>}
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
    <div className="paper flex min-h-48 flex-1 basis-48 flex-col gap-2 overflow-y-auto rounded-[2px] border border-rule p-3">
      {rows.length === 0 ? (
        <p className="text-sm italic text-ink-muted">{EMPTY_COPY}</p>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="border-b border-dashed border-rule pb-1.5 last:border-b-0">
            <p className="label-caps text-[0.62rem] text-ink-muted">{row.codename}</p>
            <p className="text-sm">{row.text}</p>
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
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={PLACEHOLDER_COPY}
          maxLength={CHAT_TEXT_MAX}
          className="paper min-h-11 min-w-0 flex-1 rounded-[2px] border-2 border-rule px-3 py-2 text-sm placeholder:text-ink-muted focus:border-accent"
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
              className="paper rounded-[2px] border border-accent/60 px-2.5 py-1 text-xs text-accent hover:bg-accent-wash"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
