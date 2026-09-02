'use client';

import { cardId, clientMessageSchema, serverMessageSchema } from '@berlin/shared';
import type { Action, CardId, ClientMessage, ServerMessage } from '@berlin/shared';
import { PartySocket } from 'partysocket';
import { usePartySocket } from 'partysocket/react';
import { useChatStore } from './chatStore.js';
import { markKicked } from './kicked.js';
import { useLoadoutStore } from './loadoutStore.js';
import { useMatchStore } from './matchStore.js';
import { useUiStore } from './uiStore.js';

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
      const message = parsed.data;

      if (message.type === 'JOINED') storeRoomToken(code, message.token);

      // Match-loop frames write straight into matchStore — this is still
      // the only place that touches the network (apps/web/lib/CLAUDE.md
      // rule 1); everything downstream reads the store, never the socket.
      if (message.type === 'VIEW') {
        useMatchStore.getState().setView(message.view);
      } else if (message.type === 'ROUND_RESOLVED') {
        useMatchStore.getState().setView(message.view);
        useMatchStore.getState().resetCommitted();
        // Round-scoped client state that must not survive into the next
        // order phase — a stale 'accepted' orderStatus or a still-filled
        // draft would otherwise leave the next round's composer permanently
        // locked (OrderComposer.tsx's locked/isActive checks never clear
        // themselves any other way).
        useMatchStore.getState().resetOrderStatus();
        useUiStore.getState().clearAllDrafts();
        // Opens the step-through report on the round that just resolved —
        // apps/web/CLAUDE.md "the screen that matters most". The composer
        // does not return until the player has clicked through it.
        useUiStore.getState().enterResolution(message.view.lastRound);
      } else if (message.type === 'OPPONENT_COMMITTED') {
        useMatchStore
          .getState()
          .setCommitted(message.playerId, message.agentsCommitted, message.agentsTotal);
      } else if (message.type === 'ORDER_ACK') {
        useMatchStore.getState().setOrderStatus(message.agentId, { state: 'accepted' });
      } else if (message.type === 'ORDER_REJECTED') {
        useMatchStore
          .getState()
          .setOrderStatus(message.agentId, { state: 'rejected', message: message.message });
      } else if (message.type === 'CLOCK') {
        useMatchStore.getState().setClock(message.deadlineAt);
      } else if (message.type === 'LOADOUT_ACK') {
        // recordAccepted, not setSaveStatus — this is the only place
        // lastAcceptedCards is ever written, from the room's own echo
        // (Plan 02-04's divergence notice reads it, never the outbound send).
        useLoadoutStore.getState().recordAccepted(message.cards.map(cardId));
      } else if (message.type === 'LOADOUT_REJECTED') {
        useLoadoutStore.getState().setSaveStatus({ state: 'rejected', message: message.message });
      } else if (message.type === 'KICKED') {
        // Marks the one-shot flag only — routing is a route's job, not
        // socket.ts's (apps/web/lib/CLAUDE.md rule 1). The lobby route's own
        // onMessage callback below does the actual router.push('/').
        markKicked();
      } else if (message.type === 'CHAT_MESSAGE') {
        useChatStore.getState().append(message.message.scope, message.message);
      } else if (message.type === 'CHAT_HISTORY') {
        useChatStore.getState().replace(message.scope, message.messages);
      }

      onMessage(message);
    },
  });
}

/**
 * Submits one agent's order for the current round. Validated against
 * clientMessageSchema before sending — the same Zod schema the room
 * re-validates against, so a malformed payload never reaches the wire.
 * Optimistic-marks the agent 'pending' locally; the server's ORDER_ACK or
 * ORDER_REJECTED reply is what actually reconciles the status (rule 4:
 * optimistic preview is advisory, the server's answer wins).
 */
export function submitOrder(
  socket: PartySocket,
  round: number,
  agentId: string,
  actions: readonly Action[],
  buySilencers?: number,
): void {
  const message: ClientMessage = {
    type: 'SUBMIT_ORDER',
    round,
    agentId,
    actions: [...actions],
    ...(buySilencers !== undefined ? { buySilencers } : {}),
  };
  useMatchStore.getState().setOrderStatus(agentId, { state: 'pending' });
  socket.send(JSON.stringify(clientMessageSchema.parse(message)));
}

/**
 * Submits the player's current loadout. Built exactly like submitOrder():
 * Zod-parsed before it reaches the wire, and the store is optimistically
 * marked 'pending' — the room's LOADOUT_ACK/LOADOUT_REJECTED reply is what
 * actually reconciles the status (rule 4: optimistic preview is advisory).
 */
export function submitLoadout(socket: PartySocket, cards: readonly CardId[]): void {
  const message: ClientMessage = { type: 'SUBMIT_LOADOUT', cards: [...cards] };
  const parsed = clientMessageSchema.safeParse(message);
  if (!parsed.success) {
    useLoadoutStore.getState().setSaveStatus({
      state: 'rejected',
      message: 'Your stored loadout is corrupted and could not be sent. Try loading a preset.',
    });
    return;
  }
  useLoadoutStore.getState().setSaveStatus({ state: 'pending' });
  socket.send(JSON.stringify(parsed.data));
}

/**
 * Sends free-text chat. Built exactly like submitOrder()/submitLoadout():
 * construct the ClientMessage, Zod-parse it before it ever reaches the wire,
 * and send only on success — a malformed payload (e.g. an over-length or
 * empty text) never reaches the room. The room's own CHAT_REJECTED reply
 * (rendered by the calling component) is the failure surface, not this
 * function's return value.
 */
export function sendChat(socket: PartySocket, text: string): void {
  const message: ClientMessage = { type: 'CHAT_SEND', text };
  const parsed = clientMessageSchema.safeParse(message);
  if (!parsed.success) return;
  socket.send(JSON.stringify(parsed.data));
}

/**
 * Sends a flavor-prompt selection. Built identically to sendChat: construct,
 * safeParse, send only on success. The client never supplies prompt text —
 * only the index — so the room, not this function, is what resolves it to
 * FLAVOR_PROMPTS' reviewed line (T-03-17).
 */
export function sendChatPrompt(socket: PartySocket, promptId: number): void {
  const message: ClientMessage = { type: 'CHAT_SEND', promptId };
  const parsed = clientMessageSchema.safeParse(message);
  if (!parsed.success) return;
  socket.send(JSON.stringify(parsed.data));
}
