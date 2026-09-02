import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLAVOR_PROMPTS } from '@berlin/shared';
import type { ChatMessage } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { canSend, chatRows } from './chatRows.js';

function message(id: string, codename: string, text: string): ChatMessage {
  return { id, scope: 'LOBBY', codename, text, at: 0 };
}

describe('apps/web/lib/chatRows canSend (pure)', () => {
  it("canSend('') and canSend('   ') are false; canSend('a') is true", () => {
    expect(canSend('')).toBe(false);
    expect(canSend('   ')).toBe(false);
    expect(canSend('a')).toBe(true);
  });
});

describe('apps/web/lib/chatRows chatRows (pure)', () => {
  it('chatRows([]) returns an empty array', () => {
    expect(chatRows([])).toEqual([]);
  });

  it('chatRows of N messages returns N rows in the same order with distinct keys', () => {
    const messages = [
      message('m1', 'Vogel', 'first'),
      message('m2', 'Katja', 'second'),
      message('m3', 'Marek', 'third'),
    ];
    const rows = chatRows(messages);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.text)).toEqual(['first', 'second', 'third']);
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });
});

describe('apps/web/lib/chatRows.ts import shape (static)', () => {
  it('contains no import of react, next/*, or partysocket', () => {
    const path = fileURLToPath(new URL('./chatRows.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/from ['"]next\//);
    expect(source).not.toMatch(/from ['"]partysocket/);
  });
});

describe('apps/web/components chat surfaces both render a prompts toggle with no local copy of the prompt list (static)', () => {
  it('ChatPanel.tsx and MatchChat.tsx each render PROMPTS_LABEL and neither declares its own FLAVOR_PROMPTS-shaped array', () => {
    const panelPath = fileURLToPath(new URL('../components/lobby/ChatPanel.tsx', import.meta.url));
    const matchChatPath = fileURLToPath(new URL('../components/match/MatchChat.tsx', import.meta.url));
    const panelSource = readFileSync(panelPath, 'utf8');
    const matchChatSource = readFileSync(matchChatPath, 'utf8');

    expect(panelSource).toMatch(/PROMPTS_LABEL/);
    // MatchChat renders the prompts toggle via the shared ChatComposer it
    // imports from ChatPanel.tsx, not a copy of its own.
    expect(matchChatSource).toMatch(/ChatComposer/);

    for (const source of [panelSource, matchChatSource]) {
      expect(source).not.toMatch(/const\s+FLAVOR_PROMPTS/);
      expect(source).not.toMatch(new RegExp(FLAVOR_PROMPTS[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });
});
