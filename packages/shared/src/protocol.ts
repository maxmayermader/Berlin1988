import { z } from 'zod';

/**
 * The wire contract between apps/web and apps/party. Zod schemas are the
 * source of truth — TS types are derived with z.infer, never hand-written in
 * parallel. Both apps import this module and nothing else defines a message
 * shape.
 *
 * This file defines only the join slice of the protocol (Plan 01-01). Later
 * plans in this phase extend clientMessageSchema/serverMessageSchema with
 * additional discriminated-union members for ready-up, orders, and
 * resolution — they never introduce a second schema file.
 */

/** Authoritative codename cap. The client's own cap is UX only. */
const codenameSchema = z.string().trim().min(1).max(20);

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
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// SET_READY and SET_CODENAME deliberately carry no playerId/identity field.
// The acting seat is always resolved from the connection binding
// (apps/party/src/auth.ts seatFor) — adding an identity field here would
// create the exact spoofing surface auth.ts exists to close.

const sectorSchema = z.enum(['RED', 'BLUE', 'GOLD', 'GREEN']);
const seatKindSchema = z.enum(['HUMAN', 'BOT', 'OPEN']);
const roomPhaseSchema = z.enum(['LOBBY', 'LOADOUT', 'IN_GAME', 'ENDED']);
const errorCodeSchema = z.enum(['UNKNOWN_CODE', 'ROOM_FULL', 'BAD_MESSAGE', 'WRONG_PHASE']);

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
 * GameState may ever be added here; that content goes through a
 * per-connection projectView() call instead (Plan 01-03).
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
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerErrorCode = z.infer<typeof errorCodeSchema>;
