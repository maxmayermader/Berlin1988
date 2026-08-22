import { projectView } from '@berlin/engine';
import { playerId as toPlayerId, serverMessageSchema } from '@berlin/shared';
import type { GameState, ServerMessage } from '@berlin/shared';
import type * as Party from 'partykit/server';
import { seatFor } from './auth.js';
import { toSnapshot, type RoomState } from './state.js';

/**
 * The sole outbound path (apps/party/src/CLAUDE.md rule 1) — the fog
 * chokepoint. Every function here validates its payload against
 * serverMessageSchema before serialising. Room-wide fan-out is permitted
 * only for LobbySnapshot, which is public-by-construction; anything derived
 * from GameState must go through a per-connection projectView() call
 * (Plan 01-03 adds that path to this same module).
 */
export function sendTo(connection: Party.Connection, message: ServerMessage): void {
  const parsed = serverMessageSchema.parse(message);
  connection.send(JSON.stringify(parsed));
}

/** Sends the current lobby snapshot to every live connection in the room. */
export function sendLobby(room: Party.Room, state: RoomState): void {
  const message: ServerMessage = { type: 'ROOM_STATE', snapshot: toSnapshot(state) };
  const parsed = serverMessageSchema.parse(message);
  const payload = JSON.stringify(parsed);
  for (const connection of room.getConnections()) {
    connection.send(payload);
  }
}

/**
 * The per-connection projectView() chokepoint (apps/party/src/CLAUDE.md
 * rule 1) — the first moment authoritative state leaves the room. One
 * projectView() call PER RECIPIENT, resolved from that recipient's own
 * seat binding via seatFor. Unlike LobbySnapshot this content is not
 * public-by-construction, so it may never travel by room-wide fan-out —
 * botfill.test.ts asserts each connection's VIEW matches its own seat and
 * that no two payloads are byte-identical.
 */
export function sendViews(room: Party.Room, state: RoomState, gameState: GameState): void {
  for (const connection of room.getConnections()) {
    const seat = seatFor(state, connection.id);
    if (!seat || !seat.playerId) continue; // no bound seat — nothing to send
    const view = projectView(gameState, toPlayerId(seat.playerId));
    const message: ServerMessage = { type: 'VIEW', view };
    const parsed = serverMessageSchema.parse(message);
    connection.send(JSON.stringify(parsed));
  }
}
