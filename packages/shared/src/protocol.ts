import { z } from 'zod';
import type { PlayerView } from './view.js';
import type { Action } from './orders.js';
import { cardId, nodeId } from './ids.js';
import { FLAVOR_PROMPTS } from './prompts.js';

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

/** 240 UTF-16 code units — the authoritative cap on a chat message's text,
 *  enforced at the wire schema before any handler runs (T-03-16). */
export const CHAT_TEXT_MAX = 240;

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

/** LOBBY while the room is in RoomPhase LOBBY/LOADOUT, MATCH once IN_GAME/ENDED
 *  — apps/party/src/chat.ts's chatScopeFor is the single function that maps a
 *  RoomPhase to one of these two, so D-10's separation is a property of the
 *  phase machine rather than a convention two call sites could drift on. */
export const chatScopeSchema = z.enum(['LOBBY', 'MATCH']);
export type ChatScope = z.infer<typeof chatScopeSchema>;

/**
 * One chat message, exactly as broadcast to every connection. Built with
 * `z.strictObject` so a sixth field (an agent id, a node id, a seat index)
 * can never be added to this payload without a deliberate schema change
 * review will see — the structural half of prohibition P-3-02 and threat
 * T-03-15. `codename` is resolved server-side from the sending connection's
 * bound seat (D-11); this schema carries no other identity field.
 */
export const chatMessageSchema = z.strictObject({
  id: z.string(),
  scope: chatScopeSchema,
  codename: codenameSchema,
  text: z.string().min(1).max(CHAT_TEXT_MAX),
  at: z.number().int(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

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
  z.object({
    type: z.literal('SUBMIT_LOADOUT'),
    // .max(64) is deliberately looser than the ruleset's loadoutSize (10) —
    // an over-long deck should still reach validateLoadout() server-side and
    // come back as a real WRONG_SIZE violation, not a generic malformed-
    // frame rejection. This bound exists only to cap payload size before any
    // engine call touches it.
    cards: z.array(cardIdOnWire).max(64),
  }),
  z.object({
    type: z.literal('SET_SEAT_COUNT'),
    // The wire bound (1..4) is deliberately the same range the server's own
    // canSetSeatCount predicate enforces — an out-of-range value is a
    // malformed frame before it ever reaches the handler, and the handler's
    // bound check remains as defence in depth rather than the only check.
    // Carries no identity field, for the same reason SET_READY does not: the
    // acting seat — and its host authority — is resolved from the
    // connection binding (apps/party/src/auth.ts seatFor), never trusted
    // from the message body.
    count: z.number().int().min(1).max(4),
  }),
  z.object({
    type: z.literal('KICK'),
    // KICK carries a seat index, not a playerId — the target is a position
    // in the room's own seats array, so there is no identity string a
    // client could forge into referring to someone else's seat. Bounded
    // 0..3 (MAX_SEAT_COUNT - 1) at the schema layer; the handler further
    // refuses an index outside the *current* seats array.
    seatIndex: z.number().int().min(0).max(3),
  }),
  z.strictObject({
    type: z.literal('CHAT_SEND'),
    // Built with z.strictObject, not z.object, so an extra field (e.g. a
    // client-supplied codename) is a parse failure rather than silently
    // stripped (T-03-13). Carries no codename, playerId, seatIndex, or
    // agentId field — the sender's codename is always resolved server-side
    // from seatFor(connectionId).codename, per D-11.
    //
    // Exactly one of `text`/`promptId` is present — enforced by the
    // superRefine below, not by two separate discriminatedUnion members
    // (a second `{ type: 'CHAT_SEND', ... }` member cannot coexist in a
    // union keyed on `type`). `promptId` is a bounded integer index into
    // FLAVOR_PROMPTS, never prompt text itself — the client can only ever
    // select a reviewed line, never author one through this path (T-03-17).
    text: z.string().min(1).max(CHAT_TEXT_MAX).optional(),
    promptId: z.number().int().min(0).max(FLAVOR_PROMPTS.length - 1).optional(),
  }),
]).superRefine((data, ctx) => {
  if (data.type !== 'CHAT_SEND') return;
  const hasText = data.text !== undefined;
  const hasPrompt = data.promptId !== undefined;
  if (hasText === hasPrompt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of text or promptId.',
    });
  }
});
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// CHAT_SEND deliberately carries no codename/playerId/seatIndex/agentId
// field either, for the same reason as every other message above (D-11): the
// acting seat — and its codename — is always resolved from the connection
// binding (apps/party/src/auth.ts seatFor), never trusted from the message
// body. Unlike the others, this one enforces it with z.strictObject rather
// than relying on the field simply not existing, since chat is the first
// surface in this codebase carrying free-form human text.

// SUBMIT_ORDER, like SET_READY and SET_CODENAME, carries no playerId — the
// acting seat is resolved from the connection binding (apps/party/src/auth.ts
// seatFor), never trusted from the message body.

// SET_READY and SET_CODENAME deliberately carry no playerId/identity field.
// The acting seat is always resolved from the connection binding
// (apps/party/src/auth.ts seatFor) — adding an identity field here would
// create the exact spoofing surface auth.ts exists to close.

// SUBMIT_LOADOUT carries no playerId or seat index either, for the same
// reason — the acting seat is always resolved via seatFor(connectionId), and
// a seat-identifying field on this schema would be a spoofing surface, not a
// convenience.

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
 *
 * `aiReadout` and `disconnected` (Phase 3 Plan 4) are the one exception to
 * "nothing derived from a bot's identity crosses the wire" that this comment
 * used to imply — and it is a deliberate one. A personality's name and title
 * are explicitly NOT hidden state: `docs/AI_OPPONENTS.md` publishes every
 * personality's habits and documented exploitable tell, and LOBBY-07
 * requires the readout string. This is unlike agent positions, safehouse,
 * traps and cooldowns — none of which any field on this schema can hold.
 * `aiReadout` carries the pre-formatted "{Name} the {Title}" string (never a
 * raw personality id, which would just be a second, unstyled way to say the
 * same thing); `disconnected` is true only while a live grace-period entry
 * exists for the seat (Task 2).
 */
export const lobbySeatSchema = z.object({
  index: z.number().int().min(0),
  playerId: z.string().nullable(),
  codename: z.string().nullable(),
  faction: sectorSchema,
  kind: seatKindSchema,
  ready: z.boolean(),
  aiReadout: z.string().nullable(),
  disconnected: z.boolean(),
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

/**
 * The lobby-directory party (Phase 3, HOME-03) — a second, singleton
 * Durable Object every match room pushes its public metadata into, so a
 * player with no join code can browse open lobbies. `DIRECTORY_ROOM_ID` is
 * the one room id this party ever serves; there is exactly one directory
 * per deployment, never one per match.
 */
export const DIRECTORY_PARTY_NAME = 'directory';
export const DIRECTORY_ROOM_ID = 'lobby-directory';

/**
 * The directory's one row shape, and — by construction — the entirety of
 * what it is allowed to know about a lobby. Built with `z.strictObject` so
 * an unrecognised key is a parse failure rather than a silently-dropped
 * field: this is the schema-level enforcement of P-3-01 (this plan's
 * threat register T-03-01) — the directory fans out to strangers who are
 * not in the room, so no field beyond these four may ever be added here.
 */
export const directoryEntrySchema = z.strictObject({
  code: z.string(),
  seatsFilled: z.number().int().min(0).max(4),
  seatsTotal: z.number().int().min(1).max(4),
  hostCodename: codenameSchema,
});
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;

/**
 * The party-to-party body `syncDirectory` POSTs to the directory — not a
 * client message, and never reachable from `clientMessageSchema`. Also
 * `z.strictObject`-built for the same reason as `directoryEntrySchema`
 * above: this is the directory's one untrusted-input boundary (03-RESEARCH.md
 * Security Domain), and the caller being this project's own code does not
 * make it trusted.
 */
export const directoryCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('UPSERT'), entry: directoryEntrySchema }),
  z.strictObject({ type: z.literal('REMOVE'), code: z.string() }),
]);
export type DirectoryCommand = z.infer<typeof directoryCommandSchema>;

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
  z.object({
    type: z.literal('CLOCK'),
    deadlineAt: z.number().nullable(),
    // paused and pausesRemaining are literals, not booleans/numbers,
    // because pausesPerPlayer is locked to 0 this phase and the pause poll
    // is not built (SKELETON.md Out of Scope) — a later phase that adds
    // pausing has to change this schema deliberately rather than by
    // accident, mirroring ClockState.
    paused: z.literal(false),
    pausesRemaining: z.literal(0),
  }),
  z.object({
    type: z.literal('LOADOUT_ACK'),
    // Echoes exactly what the room stored (post-validation) — modelled on
    // ORDER_ACK, which echoes the accepted round/agentId rather than
    // re-deriving them client-side.
    cards: z.array(z.string()),
  }),
  z.object({
    type: z.literal('LOADOUT_REJECTED'),
    // The joined engine violation text (LoadoutViolation.message), already
    // human-readable — modelled on ORDER_REJECTED's message field.
    message: z.string(),
  }),
  z.object({
    type: z.literal('DIRECTORY_STATE'),
    // The directory party's own broadcast — every entry it currently holds,
    // insertion-order preserved. Never carries anything beyond
    // directoryEntrySchema's four fields (P-3-01).
    lobbies: z.array(directoryEntrySchema),
  }),
  z.object({
    type: z.literal('SET_SEAT_COUNT_REJECTED'),
    // Deliberately no SET_SEAT_COUNT_ACK exists — success is signalled by
    // the next ROOM_STATE broadcast whose snapshot.seats.length is the new
    // count, exactly how SET_READY already signals success with no ack of
    // its own. Only the rejection needs a dedicated message, matching the
    // LOADOUT_REJECTED precedent.
    message: z.string(),
  }),
  z.object({
    type: z.literal('KICKED'),
    // Targeted at exactly one connection via sendTo — never room-wide fan
    // out. Carries only a fixed human-readable reason, no seat index, no
    // other player's identity, no room state (T-03-11).
    reason: z.string(),
  }),
  z.object({
    type: z.literal('CHAT_MESSAGE'),
    // Room-wide fan-out via apps/party/src/broadcast.ts sendChat — one
    // identical payload to every connection, never per-recipient (T-03-14,
    // prohibition P-3-02).
    message: chatMessageSchema,
  }),
  z.object({
    type: z.literal('CHAT_REJECTED'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('CHAT_HISTORY'),
    // Targeted at exactly one connection (the joining/reconnecting seat) via
    // broadcast.ts's sendChatHistory, never room-wide fan-out — but carries
    // exactly the messages every other connection already received, so it
    // introduces no per-recipient variation of the kind P-3-02 forbids.
    scope: chatScopeSchema,
    messages: z.array(chatMessageSchema),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerErrorCode = z.infer<typeof errorCodeSchema>;
export type OrderRejectionCode = z.infer<typeof orderRejectionCodeSchema>;
