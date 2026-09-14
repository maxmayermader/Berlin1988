import type { AgentId, CardId, MatchId, NodeId, PlayerId } from './ids.js';
import type { MatchPhase, OutcomeReason, Sector } from './enums.js';
import type { BlockadeEvent, MapDefinition, NodeRuntime } from './map.js';
import type { MatchSettings, Ruleset } from './settings.js';
import type { AgentOrder, ResolutionEvent } from './orders.js';
import type { PassiveEffect } from './cards.js';
import type { Signal } from './view.js';

/** Deterministic PRNG state. The only source of randomness in the engine. */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface AgentState {
  readonly id: AgentId;
  readonly playerId: PlayerId;
  nodeId: NodeId;
  dossiers: number;
  alive: boolean;
  /** Actions lost at the start of next round (blockade escapes cost one). */
  actionPenalty: number;
}

export interface Trap {
  readonly id: string;
  readonly ownerId: PlayerId;
  readonly nodeId: NodeId;
  /** Round number after which this trap expires. */
  readonly expiresAfterRound: number;
}

export interface Decoy {
  readonly id: string;
  readonly ownerId: PlayerId;
  readonly nodeId: NodeId;
  readonly expiresAfterRound: number;
}

/**
 * SERVER-ONLY. Contains four categories of hidden state — agent positions, the
 * safehouse, active traps (held globally but owned here), and cooldowns. None of
 * this may reach a client except through projectView().
 */
export interface PlayerSecrets {
  readonly id: PlayerId;
  readonly name: string;
  readonly faction: Sector;
  readonly team: string | null;
  readonly isBot: boolean;
  agents: AgentState[];
  intel: number;
  /** The player's single safehouse. Hidden from everyone else. */
  safehouse: NodeId | null;
  loadout: CardId[];
  /** Consumable passives that have not yet fired. */
  passivesAvailable: CardId[];
  /** Rounds remaining per card id. Absent or 0 means ready. */
  cooldowns: Record<string, number>;
  silencers: number;
  burnsInflicted: number;
  dossiersExtracted: number;
  eliminated: boolean;
  pausesRemaining: number;
  /** Backs the "has crossed a checkpoint this match" Radio Intercept. */
  hasCrossedCheckpoint: boolean;
}

/** One entry on the public Burn Track. Every player sees every track, identically. */
export interface BurnEntry {
  readonly round: number;
  readonly cardId: CardId | null;
  readonly icon: string;
  /** Null when redacted by Cutout. */
  readonly sector: Sector | null;
  readonly kind: 'ACTIVE' | 'PASSIVE';
  readonly effect: PassiveEffect | null;
}

export interface MatchOutcome {
  readonly reason: OutcomeReason;
  readonly winners: readonly PlayerId[];
}

/**
 * The complete authoritative state. Exists in exactly one place: the PartyKit
 * room. Never serialized to a client.
 */
export interface GameState {
  readonly matchId: MatchId;
  readonly settings: MatchSettings;
  readonly ruleset: Ruleset;
  readonly map: MapDefinition;

  round: number;
  phase: MatchPhase;
  rng: RngState;

  readonly playerOrder: PlayerId[];
  players: Record<string, PlayerSecrets>;
  nodes: Record<string, NodeRuntime>;

  traps: Trap[];
  decoys: Decoy[];
  /** Pre-rolled at match creation, which is what makes Kontrolle Schedule work. */
  readonly blockadeSchedule: BlockadeEvent[];

  /** Orders committed so far this round, keyed by agent id. */
  pendingOrders: Record<string, AgentOrder>;
  burnTracks: Record<string, BurnEntry[]>;
  /** Dossiers waiting to respawn: round they become available again. */
  dossierRespawns: number[];

  /**
   * The unfiltered log of the round just resolved. projectView reduces this
   * per player; it is never sent raw.
   */
  lastRoundLog: ResolutionEvent[];
  /**
   * Per-player, already-fog-filtered, append-only round log. Each inner array
   * is one round's events already reduced to that player's entitlement,
   * computed at the instant that round resolved — it is never re-reduced
   * against a later state. See resolveRound()'s history-append line and
   * projectView()'s direct-copy for the two halves of this invariant.
   */
  history: Record<string, ResolutionEvent[][]>;
  /**
   * Per-player signals for the current round, generated at Upkeep so that
   * projectView stays a pure read and consumes no randomness.
   */
  signals: Record<string, Signal[]>;

  outcome: MatchOutcome | null;
  nextEntityId: number;
}
