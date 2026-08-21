'use client';

import { clientMessageSchema, serverMessageSchema } from '@berlin/shared';
import type { ClientMessage, ServerMessage } from '@berlin/shared';
import { PartySocket } from 'partysocket';
import { usePartySocket } from 'partysocket/react';

/**
 * The only network surface in apps/web (apps/web/lib/CLAUDE.md rule 1). Every
 * inbound frame is Zod-parsed here; anything that fails is dropped, never
 * trusted.
 */

const MINT_ROOM_ID = '_new';
const TOKEN_KEY_PREFIX = 'berlin1988.token.';

export function partyHost(): string {
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? '127.0.0.1:1999';
}

/**
 * Mints a fresh join code via the room server's `_new` HTTP endpoint,
 * before any WebSocket connection exists — so the caller's first real
 * connection can target `room: <that code>` directly, and the room's CREATE
 * handler adopts that id as the match code with no cross-room migration.
 */
export async function mintJoinCode(): Promise<string> {
  const res = await PartySocket.fetch(
    { host: partyHost(), party: 'match', room: MINT_ROOM_ID },
    { method: 'POST' },
  );
  const body: unknown = await res.json();
  const code = (body as { code?: unknown }).code;
  if (typeof code !== 'string') {
    throw new Error('Mint endpoint did not return a code.');
  }
  return code;
}

export type HandshakeOutcome =
  | { ok: true; message: Extract<ServerMessage, { type: 'JOINED' }> }
  | { ok: false; message: Extract<ServerMessage, { type: 'ERROR' }> }
  | { ok: false; message: null };

/**
 * Opens a short-lived socket to `room`, sends exactly one ClientMessage, and
 * resolves with the first JOINED or ERROR reply, then closes the socket.
 * Used for the home page's create/join handshake, before the lobby route's
 * own persistent connection takes over.
 */
export function handshake(room: string, message: ClientMessage): Promise<HandshakeOutcome> {
  return new Promise((resolve) => {
    const socket = new PartySocket({ host: partyHost(), party: 'match', room });
    let settled = false;

    const finish = (outcome: HandshakeOutcome) => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(outcome);
    };

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(clientMessageSchema.parse(message)));
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      let parsed: ReturnType<typeof serverMessageSchema.safeParse>;
      try {
        parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
      } catch {
        return; // drop-and-log: malformed frame, never trusted
      }
      if (!parsed.success) return;
      if (parsed.data.type === 'JOINED') finish({ ok: true, message: parsed.data });
      else if (parsed.data.type === 'ERROR') finish({ ok: false, message: parsed.data });
    });

    socket.addEventListener('close', () => finish({ ok: false, message: null }));
  });
}

export function storeRoomToken(code: string, token: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(TOKEN_KEY_PREFIX + code, token);
}

export function readRoomToken(code: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY_PREFIX + code);
}

/**
 * The lobby route's persistent connection to `room: code`. Rebinds to the
 * seat established by the home page's create/join handshake via the stored
 * token, if present — otherwise the room server binds the next open seat.
 */
export function useRoomSocket(
  code: string,
  codename: string,
  onMessage: (message: ServerMessage) => void,
): PartySocket {
  return usePartySocket({
    host: partyHost(),
    party: 'match',
    room: code,
    onOpen(event) {
      const socket = event.target as PartySocket;
      const token = readRoomToken(code) ?? undefined;
      const join: ClientMessage = { type: 'JOIN', code, codename, token };
      socket.send(JSON.stringify(clientMessageSchema.parse(join)));
    },
    onMessage(event) {
      let parsed: ReturnType<typeof serverMessageSchema.safeParse>;
      try {
        parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (!parsed.success) return;
      if (parsed.data.type === 'JOINED') storeRoomToken(code, parsed.data.token);
      onMessage(parsed.data);
    },
  });
}
