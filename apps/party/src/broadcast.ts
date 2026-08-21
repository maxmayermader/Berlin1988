import { serverMessageSchema } from '@berlin/shared';
import type { ServerMessage } from '@berlin/shared';
import type * as Party from 'partykit/server';
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
