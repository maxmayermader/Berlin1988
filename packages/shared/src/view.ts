import type { AgentId, CardId, NodeId, PlayerId } from './ids.js';
import type { MatchPhase, Sector } from './enums.js';
import type { BlockadeEvent, MapDefinition, NodeRuntime } from './map.js';
import type { MatchSettings, Ruleset } from './settings.js';
import type { AgentState, BurnEntry, MatchOutcome, Trap, Decoy } from './state.js';
import type { ResolutionEvent } from './orders.js';

/**
 * What a player is allowed to know about someone else. Deliberately has no
 * field capable of holding an agent position, a safehouse, or a trap — the
 * fog boundary is enforced by this type's shape, not by remembering to omit.
 */
export interface OpponentPublicInfo {
  readonly id: PlayerId;
  readonly name: string;
  readonly faction: Sector;
  readonly team: string | null;
  readonly isBot: boolean;
  /** Public — the Butcher's empty Intel meter is a legitimate read. */
  readonly intel: number;
  readonly agentsAlive: number;
  readonly agentsTotal: number;
  readonly score: number;
  readonly eliminated: boolean;
  readonly committedAgents: number;
}

export type SignalKind =
  | 'CHATTER'
  | 'NOT_ALONE'
  | 'INFORMANT_REPORT'
  | 'RADIO_INTERCEPT'
  | 'BORDER_CROSSING'
  | 'DOSSIER_TAKEN'
  | 'STRIKE_EXACT'
  | 'STRIKE_VICINITY'
  | 'BURN'
  | 'BLOCKADE_ANNOUNCED'
  | 'BLOCKADE_ACTIVE';

/**
 * The machine-readable form of a Radio Intercept.
 *
 * A human reads the sentence; a bot needs the same fact structurally. This is
 * not extra information — it is exactly what the text says, and it stays
 * anonymous (never names which rival it describes) for the same reason the
 * prose does.
 */
export type InterceptFact =
  | { readonly kind: 'IN_SECTOR'; readonly sector: Sector }
  | { readonly kind: 'NEAR_NODE'; readonly nodeId: NodeId; readonly within: number }
  | { readonly kind: 'DID_NOT_MOVE' }
  | { readonly kind: 'CARRYING_DOSSIER' }
  | { readonly kind: 'CROSSED_CHECKPOINT' };

/** One line of the per-round information drip (docs/GAME_DESIGN.md §10). */
export interface Signal {
  readonly kind: SignalKind;
  readonly round: number;
  readonly nodeId: NodeId | null;
  readonly sector: Sector | null;
  readonly playerId: PlayerId | null;
  /** Human-readable form. Also what a screen reader announces. */
  readonly text: string;
  /** Present only on RADIO_INTERCEPT. The same fact as `text`, parsed. */
  readonly intercept?: InterceptFact;
}

export interface ClockState {
  readonly deadlineAt: number | null;
  readonly paused: boolean;
  readonly pausesRemaining: number;
}

/** The viewing player's own state, in full. */
export interface SelfView {
  readonly id: PlayerId;
  readonly name: string;
  readonly faction: Sector;
  readonly team: string | null;
  readonly agents: readonly AgentState[];
  readonly intel: number;
  readonly safehouse: NodeId | null;
  readonly loadout: readonly CardId[];
  readonly passivesAvailable: readonly CardId[];
  readonly cooldowns: Readonly<Record<string, number>>;
  readonly silencers: number;
  readonly traps: readonly Trap[];
  readonly decoys: readonly Decoy[];
  readonly burnsInflicted: number;
  readonly dossiersExtracted: number;
  /**
   * 01-06-PLAN.md's one deliberate engine-side change this phase.
   * `OpponentPublicInfo.score` already exposes every opponent's score, so
   * without this field a player is the only participant in the match who
   * cannot see their own standing — and the result screen would have to
   * recompute it client-side, which 01-RESEARCH.md's Don't Hand-Roll table
   * forbids (a second scoring implementation can disagree with the engine
   * about who won). Filled by projectView() from the identical scoreOf()
   * call that fills OpponentPublicInfo.score, so the two can never drift.
   * Nothing is added to OpponentPublicInfo — the fog boundary is unchanged
   * in both directions (packages/engine/tests/score-symmetry.test.ts).
   */
  readonly score: number;
  readonly eliminated: boolean;
  /** Populated only for a holder of Kontrolle Schedule. */
  readonly knownBlockades: readonly BlockadeEvent[];
}

/**
 * THE fog boundary. The only shape that may be sent to a client.
 * Produced exclusively by engine.projectView().
 */
export interface PlayerView {
  readonly matchId: string;
  readonly round: number;
  readonly phase: MatchPhase;
  readonly settings: MatchSettings;
  readonly ruleset: Ruleset;
  readonly map: MapDefinition;

  readonly self: SelfView;
  readonly opponents: readonly OpponentPublicInfo[];

  /** Only nodes this player can currently see. */
  readonly visibleNodes: Readonly<Record<string, NodeRuntime>>;
  /** Blockades are public once active or announced. */
  readonly activeBlockades: Readonly<Record<string, number>>;
  readonly announcedBlockades: readonly BlockadeEvent[];

  readonly signals: readonly Signal[];
  /** Every player's track, including the viewer's own, identically redacted. */
  readonly burnTracks: Readonly<Record<string, readonly BurnEntry[]>>;
  /** Last round's events, already filtered to this player's entitlement. */
  readonly lastRound: readonly ResolutionEvent[];
  /**
   * This player's whole match history, each round already filtered to this
   * player's entitlement. A flat array, deliberately not a Record keyed by
   * player id like `burnTracks` — history is not symmetric-public, so
   * PlayerView must have no field capable of holding another player's
   * filtered log.
   */
  readonly history: readonly (readonly ResolutionEvent[])[];

  readonly clock: ClockState;
  readonly outcome: MatchOutcome | null;
}
