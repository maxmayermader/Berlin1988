import type { ChatMessage } from '@berlin/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from './chatStore.js';

function message(id: string, scope: ChatMessage['scope']): ChatMessage {
  return { id, scope, codename: 'Vogel', text: `text-${id}`, at: 0 };
}

describe('apps/web/lib/chatStore useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: { LOBBY: [], MATCH: [] }, unread: 0 });
  });

  it("replace(scope, messages) overwrites that scope's array wholesale and leaves the other scope untouched", () => {
    useChatStore.getState().append('LOBBY', message('l1', 'LOBBY'));
    useChatStore.getState().append('MATCH', message('m1', 'MATCH'));

    useChatStore.getState().replace('LOBBY', [message('l2', 'LOBBY'), message('l3', 'LOBBY')]);

    expect(useChatStore.getState().messages.LOBBY.map((m) => m.id)).toEqual(['l2', 'l3']);
    expect(useChatStore.getState().messages.MATCH.map((m) => m.id)).toEqual(['m1']);
  });

  it('append increments unread; markRead resets it to zero', () => {
    useChatStore.getState().append('MATCH', message('m1', 'MATCH'));
    useChatStore.getState().append('MATCH', message('m2', 'MATCH'));
    expect(useChatStore.getState().unread).toBe(2);

    useChatStore.getState().markRead();
    expect(useChatStore.getState().unread).toBe(0);
  });

  it('replace does not affect the unread counter', () => {
    useChatStore.getState().append('MATCH', message('m1', 'MATCH'));
    useChatStore.getState().replace('LOBBY', [message('l1', 'LOBBY')]);
    expect(useChatStore.getState().unread).toBe(1);
  });
});
