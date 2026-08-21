import { seedRng } from '@berlin/engine';
import { clientMessageSchema } from '@berlin/shared';
import type { RngState } from '@berlin/shared';
import type * as Party from 'partykit/server';
import { sendLobby, sendTo } from './broadcast.js';
import { handleCreate, handleJoin, handleSetCodename, handleSetReady } from './handlers.js';
import { newJoinCode } from './joinCode.js';
import type { RoomState } from './state.js';

const MINT_ROOM_ID = '_new';
const STATE_KEY = 'state';

/** Permissive for local dev, where apps/web and apps/party run on different
 *  ports/origins. This endpoint returns nothing sensitive — a fresh,
 *  unclaimed join code — so a permissive origin costs nothing here. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * The PartyKit Server for the match room. Per-connection logic lives only in
 * the message and close handlers — never the connect handler — because
 * Durable Objects can hibernate between messages, and this project's 90s
 * order window (D-04) is exactly the kind of idle gap where that happens
 * (01-RESEARCH.md Pitfall 3).
 * RoomState is persisted to `this.room.storage` after every mutation and
 * rehydrated in onStart for the same reason.
 */
export default class MatchRoom implements Party.Server {
  state: RoomState | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart(): Promise<void> {
    const stored = await this.room.storage.get<RoomState>(STATE_KEY);
    this.state = stored ?? null;
  }

  /**
   * Plain HTTP entry point. The only route served here is the join-code
   * mint at room id `_new`: it hands the client a fresh, curated-alphabet
   * code before any WebSocket connection exists, so the client's first real
   * connection can target `room: <that code>` directly, and CREATE's
   * onMessage handler below adopts that id as the match code with no
   * cross-room migration required.
   *
   * apps/web (port 3000) and apps/party (port 1999) are different origins in
   * local dev, so this plain-HTTP endpoint needs explicit CORS headers —
   * WebSocket connections aren't subject to the same-origin policy, so
   * onMessage above needs none of this.
   */
  onRequest(req: Party.Request): Response | Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (this.room.id !== MINT_ROOM_ID || req.method !== 'POST') {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
    const code = newJoinCode(freshRng());
    return Response.json({ code }, { headers: CORS_HEADERS });
  }

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): Promise<void> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      sendTo(sender, { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Malformed frame.' });
      return;
    }

    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      sendTo(sender, { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Malformed frame.' });
      return;
    }

    const message = parsed.data;
    const rng = freshRng();

    if (message.type === 'CREATE') {
      const result = handleCreate(this.room.id, message.codename, sender.id, rng);
      await this.persist(result.state);
      sendTo(sender, result.toSender);
      if (result.broadcastRoomState && result.state) sendLobby(this.room, result.state);
      return;
    }

    if (message.type === 'JOIN') {
      const result = handleJoin(this.state, message, sender.id, rng);
      await this.persist(result.state);
      sendTo(sender, result.toSender);
      if (result.broadcastRoomState && result.state) sendLobby(this.room, result.state);
      return;
    }

    if (message.type === 'SET_READY') {
      const next = handleSetReady(this.state, message.ready, sender.id);
      await this.persist(next);
      if (next) sendLobby(this.room, next);
      return;
    }

    // message.type === 'SET_CODENAME'
    const next = handleSetCodename(this.state, message.codename, sender.id);
    await this.persist(next);
    if (next) sendLobby(this.room, next);
  }

  onClose(): void {
    // No reconnection handling in Phase 1 (D-11) — an accepted, documented
    // gap, not a bug. A dropped connection simply leaves its seat bound to a
    // now-dead connection id until the room is next touched.
  }

  private async persist(state: RoomState | null): Promise<void> {
    this.state = state;
    if (state) await this.room.storage.put(STATE_KEY, state);
  }
}

/**
 * Every inbound message gets a freshly seeded RNG from the engine's own
 * seedRng — never the platform's global random source, which stays banned
 * here exactly as it is everywhere below apps/. Seeded from
 * crypto.randomUUID(), a cryptographically strong source, not the banned one.
 */
function freshRng(): RngState {
  return seedRng(crypto.randomUUID());
}
