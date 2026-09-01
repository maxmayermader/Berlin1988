'use client';

import { DIRECTORY_PARTY_NAME, DIRECTORY_ROOM_ID, serverMessageSchema } from '@berlin/shared';
import type { DirectoryEntry } from '@berlin/shared';
import { usePartySocket } from 'partysocket/react';
import { useCallback, useState } from 'react';
import { partyHost } from './socket.js';

export interface DirectoryFeed {
  readonly lobbies: DirectoryEntry[];
  readonly connected: boolean;
  readonly everConnected: boolean;
}

/**
 * The Open Lobbies list's one network surface — a read-only subscription to
 * the directory party, entirely separate from lib/socket.ts's match-room
 * connection. No JOIN handshake: the directory has no seats. Holds its own
 * React state rather than writing into any Zustand store — this feed is
 * home-page-local and has no other consumer.
 *
 * Every inbound frame is Zod-parsed with serverMessageSchema.safeParse
 * inside a try/catch, and anything that isn't a successful DIRECTORY_STATE
 * is dropped — the identical drop-and-never-trust discipline lib/socket.ts's
 * useRoomSocket applies to every frame it receives.
 */
export function useDirectorySocket(): DirectoryFeed {
  const [lobbies, setLobbies] = useState<DirectoryEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);

  const onMessage = useCallback((event: MessageEvent) => {
    let parsed: ReturnType<typeof serverMessageSchema.safeParse>;
    try {
      parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
    } catch {
      return; // malformed frame — drop-and-never-trust, never surfaced
    }
    if (!parsed.success || parsed.data.type !== 'DIRECTORY_STATE') return;
    setLobbies(parsed.data.lobbies);
    setEverConnected(true);
  }, []);

  usePartySocket({
    host: partyHost(),
    party: DIRECTORY_PARTY_NAME,
    room: DIRECTORY_ROOM_ID,
    onOpen: () => setConnected(true),
    onMessage,
    // Deliberately does NOT clear `lobbies` on close: a directory-party
    // outage must not make the home page look broken while direct
    // code-join (HOME-02) still works, so a dropped connection leaves
    // whatever rows were last received on screen, stale-but-visible,
    // rather than snapping the list to empty or an error state.
    onClose: () => setConnected(false),
  });

  return { lobbies, connected, everConnected };
}
