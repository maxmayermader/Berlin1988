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

/**
 * OPPONENT_COMMITTED — room-wide fan-out of one seat's commit count. Safe
 * to broadcast because the count is public-by-design (OpponentPublicInfo
 * already carries it) and this function derives it from KEY PRESENCE in
 * pendingOrders alone — the order object at that key is never read,
 * indexed, spread, or serialised here (apps/party/src/CLAUDE.md rule 3;
 * threat T-1-13). Content stays sealed; only the count crosses the wire.
 */
export function sendCommitted(room: Party.Room, gameState: GameState, playerId: string): void {
  const p = gameState.players[playerId];
  if (!p) return;
  const committedAgentIds = new Set(Object.keys(gameState.pendingOrders));
  const liveAgents = p.agents.filter((a) => a.alive);
  const agentsCommitted = liveAgents.filter((a) => committedAgentIds.has(a.id as string)).length;

  const message: ServerMessage = {
    type: 'OPPONENT_COMMITTED',
    playerId,
    agentsCommitted,
    agentsTotal: liveAgents.length,
  };
  const parsed = serverMessageSchema.parse(message);
  const payload = JSON.stringify(parsed);
  for (const connection of room.getConnections()) {
    connection.send(payload);
  }
}

/**
 * ROUND_RESOLVED — one projectView() call PER RECIPIENT, exactly like
 * sendViews above. resolveRound()'s raw ResolutionEvent[] log is not a
 * parameter of this function and is never in scope inside it —
 * PlayerView.lastRound is already fog-filtered by projectView, and that
 * field alone is the frame's payload.
 */
export function sendResolved(room: Party.Room, state: RoomState, gameState: GameState): void {
  for (const connection of room.getConnections()) {
    const seat = seatFor(state, connection.id);
    if (!seat || !seat.playerId) continue;
    const view = projectView(gameState, toPlayerId(seat.playerId));
    const message: ServerMessage = { type: 'ROUND_RESOLVED', view };
    const parsed = serverMessageSchema.parse(message);
    connection.send(JSON.stringify(parsed));
  }
}

/**
 * CLOCK — the round deadline, room-wide. Safe to broadcast because
 * `deadlineAt` is genuinely identical for every connection and carries
 * nothing derived from a player's secrets; `paused`/`pausesRemaining` are
 * schema literals this phase (no pause poll — SKELETON.md Out of Scope).
 */
export function sendClock(room: Party.Room, state: RoomState): void {
  const message: ServerMessage = {
    type: 'CLOCK',
    deadlineAt: state.deadlineAt,
    paused: false,
    pausesRemaining: 0,
  };
  const parsed = serverMessageSchema.parse(message);
  const payload = JSON.stringify(parsed);
  for (const connection of room.getConnections()) {
    connection.send(payload);
  }
}
