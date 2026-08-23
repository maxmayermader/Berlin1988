import { z } from 'zod';
import type { PlayerView } from './view.js';
import type { Action } from './orders.js';
import { cardId, nodeId } from './ids.js';

/**
 * The wire contract between apps/web and apps/party. Zod schemas are the
 * source of truth — TS types are derived with z.infer, never hand-written in
 * parallel. Both apps import this module and nothing else defines a message
 * shape.
 *
 * This file defines the join and ready-up slice (Plans 01-01/01-02) plus the
 * order/clock/resolution slice (Plan 01-03) of the protocol. Later plans in
 * this phase extend clientMessageSchema/serverMessageSchema with additional
 * discriminated-union members — they never introduce a second schema file.
 */

/** Authoritative codename cap. The client's own cap is UX only. */
const codenameSchema = z.string().trim().min(1).max(20);

/**
 * Node and card ids arrive as z.string() on the wire and are branded on the
 * way in via .transform() — a type-safety convenience only. The engine
 * re-checks membership independently regardless of what the wire claims.
 */
const nodeIdOnWire = z.string().transform((s) => nodeId(s));
const cardIdOnWire = z.string().transform((s) => cardId(s));

/**
 * Mirrors packages/shared/src/orders.ts's Action union member-for-member.
 * Annotated as z.ZodType<Action> so a future divergence between the schema
 * and the Action union is a compile error rather than a runtime surprise.
 */
export const actionSchema: z.ZodType<Action> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('HOLD') }),
  z.object({ type: z.literal('MOVE'), to: nodeIdOnWire }),
  z.object({
    type: z.literal('SPRINT'),
    via: nodeIdOnWire,
    to: nodeIdOnWire,
    cardId: cardIdOnWire.optional(),
  }),
  z.object({ type: z.literal('WIRETAP'), cardId: cardIdOnWire, target: nodeIdOnWire }),
  z.object({ type: z.literal('BRIBE'), cardId: cardIdOnWire }),
  z.object({ type: z.literal('DECOY'), cardId: cardIdOnWire, target: nodeIdOnWire }),
  z.object({ type: z.literal('SAFEHOUSE'), cardId: cardIdOnWire }),
  z.object({ type: z.literal('STRIKE'), cardId: cardIdOnWire, target: nodeIdOnWire }),
  z.object({ type: z.literal('AMBUSH'), cardId: cardIdOnWire }),
]);

/** One agent's committed round, as it arrives on the wire (before the
 *  `round` and `type` envelope fields SUBMIT_ORDER adds). Not currently
 *  spread into clientMessageSchema — kept as its own export so a later
 *  message type (e.g. a loadout-time order preview) can reuse the shape
 *  without redeclaring it. */
export const agentOrderSchema = z.object({
  agentId: z.string(),
  actions: z.array(actionSchema).min(1).max(2),
  buySilencers: z.number().int().min(0).optional(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CREATE'),
    codename: codenameSchema,
  }),
  z.object({
    type: z.literal('JOIN'),
    code: z.string(),
    codename: codenameSchema,
    token: z.string().optional(),
  }),
  z.object({
    type: z.literal('SET_READY'),
    ready: z.boolean(),
  }),
  z.object({
    type: z.literal('SET_CODENAME'),
    codename: codenameSchema,
  }),
  z.object({
    type: z.literal('SUBMIT_ORDER'),
    round: z.number().int(),
    agentId: z.string(),
    actions: z.array(actionSchema).min(1).max(2),
    buySilencers: z.number().int().min(0).optional(),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// SUBMIT_ORDER, like SET_READY and SET_CODENAME, carries no playerId — the
// acting seat is resolved from the connection binding (apps/party/src/auth.ts
// seatFor), never trusted from the message body.

// SET_READY and SET_CODENAME deliberately carry no playerId/identity field.
// The acting seat is always resolved from the connection binding
// (apps/party/src/auth.ts seatFor) — adding an identity field here would
// create the exact spoofing surface auth.ts exists to close.

const sectorSchema = z.enum(['RED', 'BLUE', 'GOLD', 'GREEN']);
const seatKindSchema = z.enum(['HUMAN', 'BOT', 'OPEN']);
const roomPhaseSchema = z.enum(['LOBBY', 'LOADOUT', 'IN_GAME', 'ENDED']);
const errorCodeSchema = z.enum(['UNKNOWN_CODE', 'ROOM_FULL', 'BAD_MESSAGE', 'WRONG_PHASE']);

/** Mirrors packages/shared/src/orders.ts's OrderRejection['code'] union. */
const orderRejectionCodeSchema = z.enum([
  'NOT_YOUR_AGENT',
  'AGENT_DEAD',
  'TOO_MANY_ACTIONS',
  'ILLEGAL_ACTION',
  'CARD_NOT_IN_LOADOUT',
  'CARD_ON_COOLDOWN',
  'INSUFFICIENT_INTEL',
  'WRONG_PHASE',
]);

/**
 * A single lobby seat, public-by-construction: no field here can hold agent
 * positions, safehouse, traps, or cooldowns. Safe to fan out to every
 * connection in the room without a per-recipient projection.
 */
export const lobbySeatSchema = z.object({
  index: z.number().int().min(0),
  playerId: z.string().nullable(),
  codename: z.string().nullable(),
  faction: sectorSchema,
  kind: seatKindSchema,
  ready: z.boolean(),
});
export type LobbySeat = z.infer<typeof lobbySeatSchema>;

/**
 * The room's public snapshot. Lobby bookkeeping only — nothing derived from
 * GameState may ever be added here; that content goes through the
 * per-connection VIEW message instead (apps/party/src/broadcast.ts sendViews).
 */
export const lobbySnapshotSchema = z.object({
  code: z.string(),
  phase: roomPhaseSchema,
  hostPlayerId: z.string(),
  seats: z.array(lobbySeatSchema),
  /** Absolute ms timestamp the match auto-starts at, or null when no
   *  countdown is running. Server-authoritative — clients render from this
   *  value alone and never recompute the >=50% threshold themselves. */
  startsAt: z.number().nullable(),
});
export type LobbySnapshot = z.infer<typeof lobbySnapshotSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ROOM_STATE'),
    snapshot: lobbySnapshotSchema,
  }),
  z.object({
    type: z.literal('ERROR'),
    code: errorCodeSchema,
    message: z.string(),
  }),
  z.object({
    type: z.literal('JOINED'),
    playerId: z.string(),
    token: z.string(),
    code: z.string(),
  }),
  z.object({
    type: z.literal('VIEW'),
    // The runtime shape is already guaranteed by projectView() being the
    // sole producer (packages/engine's fog boundary) — this schema's job
    // here is union membership, not re-validation.
    view: z.custom<PlayerView>(),
  }),
  z.object({
    type: z.literal('ORDER_ACK'),
    round: z.number().int(),
    agentId: z.string(),
  }),
  z.object({
    type: z.literal('ORDER_REJECTED'),
    round: z.number().int(),
    agentId: z.string(),
    code: orderRejectionCodeSchema,
    message: z.string(),
  }),
  z.object({
    type: z.literal('OPPONENT_COMMITTED'),
    playerId: z.string(),
    agentsCommitted: z.number().int().min(0),
    agentsTotal: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('ROUND_RESOLVED'),
    // PlayerView.lastRound is already fog-filtered by projectView() — this
    // is the sole payload field. A second field carrying resolveRound()'s
    // raw ResolutionEvent[] would ship every player's strike origin, trap
    // trigger, and burned-agent identity to everyone, undoing the fog model
    // packages/engine/tests/fog-leak.test.ts protects (T-1-01).
    view: z.custom<PlayerView>(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerErrorCode = z.infer<typeof errorCodeSchema>;
export type OrderRejectionCode = z.infer<typeof orderRejectionCodeSchema>;
