import type { NodeId, PlayerId } from './ids.js';
import type { EdgeType, Sector } from './enums.js';

export interface Edge {
  readonly to: NodeId;
  readonly type: EdgeType;
}

/** Static map geometry. Never mutated during a match. */
export interface MapNode {
  readonly id: NodeId;
  readonly name: string;
  readonly sector: Sector;
  /** Percentages, for responsive SVG layout. Rendering reads these; rules never do. */
  readonly x: number;
  readonly y: number;
  readonly edges: readonly Edge[];
  readonly isUBahnStation: boolean;
  /** Which faction may extract here, if any. */
  readonly extractionFor: Sector | null;
  /** Whether this node offers an informant to bribe. */
  readonly hasInformant: boolean;
}

export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly MapNode[];
}

/** Per-node mutable state. Lives in GameState, keyed by NodeId. */
export interface NodeRuntime {
  informantOwner: PlayerId | null;
  /** Count, not a flag — a burned agent drops everything it was carrying here. */
  dossiers: number;
  /** Round number (exclusive) this node reopens, or null if open. */
  blockadedUntil: number | null;
}

/** A pre-rolled blockade. The whole schedule exists from match creation. */
export interface BlockadeEvent {
  readonly nodeId: NodeId;
  /** Round the node closes. */
  readonly round: number;
  /** Rounds it stays closed. */
  readonly duration: number;
  /** Whether it is publicly declared one round early. */
  readonly announced: boolean;
}
