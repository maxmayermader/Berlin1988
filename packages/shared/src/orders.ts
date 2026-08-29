import type { AgentId, CardId, NodeId, PlayerId } from './ids.js';
import type { PassiveEffect } from './cards.js';
import type { OutcomeReason, Sector } from './enums.js';

/**
 * One of an agent's two actions.
 *
 * Note that the order actions are listed in only matters for movement. Every
 * other action resolves in its fixed pipeline slot (docs/GAME_DESIGN.md §7.2),
 * so listing STRIKE before MOVE does not make the strike happen first.
 */
export type Action =
  | { readonly type: 'HOLD' }
  | { readonly type: 'MOVE'; readonly to: NodeId }
  /** Two hops in one action. Costs Intel, or is free if paid for with an AGENT card. */
  | {
      readonly type: 'SPRINT';
      readonly via: NodeId;
      readonly to: NodeId;
      readonly cardId?: CardId;
    }
  | { readonly type: 'WIRETAP'; readonly cardId: CardId; readonly target: NodeId }
  | { readonly type: 'BRIBE'; readonly cardId: CardId }
  | { readonly type: 'DECOY'; readonly cardId: CardId; readonly target: NodeId }
  | { readonly type: 'SAFEHOUSE'; readonly cardId: CardId }
  /** Strike Mode A — advance into the target node and burn whoever is there. */
  | { readonly type: 'STRIKE'; readonly cardId: CardId; readonly target: NodeId }
  /** Strike Mode B — set a hidden trap on the agent's own node. */
  | { readonly type: 'AMBUSH'; readonly cardId: CardId };

export type ActionType = Action['type'];

/** One agent's committed round. Silencer purchases cost Intel but no action. */
export interface AgentOrder {
  readonly agentId: AgentId;
  readonly actions: readonly Action[];
  readonly buySilencers?: number;
}

export interface OrderRejection {
  readonly agentId: AgentId;
  readonly code:
    | 'NOT_YOUR_AGENT'
    | 'AGENT_DEAD'
    | 'TOO_MANY_ACTIONS'
    | 'ILLEGAL_ACTION'
    | 'CARD_NOT_IN_LOADOUT'
    | 'CARD_ON_COOLDOWN'
    | 'INSUFFICIENT_INTEL'
    | 'WRONG_PHASE';
  readonly message: string;
}

/** How a contested node was decided. Surfaced so a losing coin flip is legible. */
export type ContestMethod = 'MUTUAL_TRAP' | 'SAFEHOUSE' | 'COIN_FLIP' | 'K9_ROLL';

export type BurnCause = 'STRIKE' | 'AMBUSH' | 'BLOCKADE' | 'CONTEST';

/**
 * The complete, unfiltered record of a round. Fog projection reduces this
 * per player; the resolution pipeline never pre-redacts.
 */
export type ResolutionEvent =
  | { readonly type: 'ROUND_START'; readonly round: number }
  | { readonly type: 'SAFEHOUSE_PLACED'; readonly playerId: PlayerId; readonly nodeId: NodeId }
  | { readonly type: 'AMBUSH_SET'; readonly playerId: PlayerId; readonly nodeId: NodeId }
  | { readonly type: 'DECOY_PLACED'; readonly playerId: PlayerId; readonly nodeId: NodeId }
  | {
      readonly type: 'AGENT_MOVED';
      readonly playerId: PlayerId;
      readonly agentId: AgentId;
      readonly from: NodeId;
      readonly to: NodeId;
      readonly viaTunnel: boolean;
      readonly viaCheckpoint: boolean;
      readonly sprint: boolean;
    }
  | {
      readonly type: 'CHECKPOINT_CROSSED';
      readonly playerId: PlayerId;
      readonly nodeId: NodeId;
      readonly silent: boolean;
    }
  | {
      readonly type: 'AMBUSH_TRIGGERED';
      readonly ownerId: PlayerId;
      readonly victimId: PlayerId;
      /** Nulled by fog projection for the trap owner — they learn that someone
       *  walked in and where, never which specific agent. */
      readonly victimAgentId: AgentId | null;
      readonly nodeId: NodeId;
      readonly escaped: boolean;
      readonly escapedTo: NodeId | null;
      readonly sealed: boolean;
    }
  | { readonly type: 'BLOCKADE_ANNOUNCED'; readonly nodeId: NodeId; readonly round: number }
  | { readonly type: 'BLOCKADE_CLOSED'; readonly nodeId: NodeId; readonly until: number }
  | { readonly type: 'BLOCKADE_LIFTED'; readonly nodeId: NodeId }
  | {
      readonly type: 'BLOCKADE_CAUGHT';
      readonly playerId: PlayerId;
      readonly agentId: AgentId;
      readonly nodeId: NodeId;
      readonly survived: boolean;
      readonly relocatedTo: NodeId | null;
    }
  | { readonly type: 'INFORMANT_CLAIMED'; readonly playerId: PlayerId; readonly nodeId: NodeId }
  | {
      readonly type: 'WIRETAP_RESULT';
      readonly playerId: PlayerId;
      readonly target: NodeId;
      readonly results: readonly { readonly nodeId: NodeId; readonly occupied: boolean }[];
    }
  | {
      readonly type: 'STRIKE_FIRED';
      readonly playerId: PlayerId;
      /** Nulled by fog projection for anyone who isn't the striker. */
      readonly agentId: AgentId | null;
      readonly from: NodeId;
      readonly target: NodeId;
      readonly sector: Sector;
      readonly silenced: boolean;
    }
  | {
      readonly type: 'CONTEST';
      readonly nodeId: NodeId;
      readonly claimants: readonly PlayerId[];
      readonly winner: PlayerId | null;
      readonly method: ContestMethod;
    }
  | {
      readonly type: 'AGENT_BURNED';
      readonly playerId: PlayerId;
      /** Nulled by fog projection for anyone but the owner. */
      readonly agentId: AgentId | null;
      readonly nodeId: NodeId;
      readonly byPlayerId: PlayerId | null;
      readonly cause: BurnCause;
      readonly dossiersDropped: number;
    }
  | {
      readonly type: 'DOSSIER_TAKEN';
      readonly playerId: PlayerId;
      readonly agentId: AgentId | null;
      readonly nodeId: NodeId;
    }
  | { readonly type: 'DOSSIER_SPAWNED'; readonly nodeId: NodeId }
  | {
      readonly type: 'EXTRACTION';
      readonly playerId: PlayerId;
      readonly agentId: AgentId | null;
      readonly nodeId: NodeId;
    }
  | {
      readonly type: 'PASSIVE_FIRED';
      readonly playerId: PlayerId;
      readonly cardId: CardId;
      readonly effect: PassiveEffect;
      readonly consumed: boolean;
    }
  | { readonly type: 'CARD_PLAYED'; readonly playerId: PlayerId; readonly cardId: CardId }
  | { readonly type: 'SILENCER_BOUGHT'; readonly playerId: PlayerId; readonly count: number }
  | { readonly type: 'INTEL_GAINED'; readonly playerId: PlayerId; readonly amount: number }
  | { readonly type: 'PLAYER_ELIMINATED'; readonly playerId: PlayerId }
  | {
      readonly type: 'MATCH_ENDED';
      readonly reason: OutcomeReason;
      readonly winners: readonly PlayerId[];
    };

export type ResolutionEventType = ResolutionEvent['type'];
