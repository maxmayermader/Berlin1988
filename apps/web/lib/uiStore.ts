import { create } from 'zustand';
import type { AgentId, NodeId, ResolutionEvent } from '@berlin/shared';
import { emptyDraft, type OrderDraft } from './orderDraft.js';
import { advance, initialReveal, type RevealState } from './stepThrough.js';

/**
 * Session and UI state only — apps/web/CLAUDE.md rule 5. The projected view
 * lives in matchStore and is never duplicated here: this store holds the
 * player's own in-progress composition (selection, per-agent draft, hover),
 * the resolution report's reveal progress, plus the connection's own
 * lifecycle state.
 */

export type ConnectionStatus = 'connecting' | 'open' | 'lost';

/** Which of the two round sub-screens the match route renders — composing
 *  orders, or stepping through the round that just resolved. Distinct from
 *  `view.phase`: after a ROUND_RESOLVED frame, `view.phase` is already
 *  'ORDERS' for the *next* round (resolveRound's upkeep increments it
 *  before the client ever sees it), so this flag is what keeps the
 *  step-through on screen until the player clicks through it. */
export type MatchSubState = 'ORDERS' | 'RESOLUTION';

interface UiStore {
  readonly selectedAgentId: AgentId | null;
  /** Keyed by agentId. */
  readonly draftByAgent: Readonly<Record<string, OrderDraft>>;
  readonly hoverNodeId: NodeId | null;
  readonly connectionStatus: ConnectionStatus;
  readonly matchSubState: MatchSubState;
  readonly reveal: RevealState | null;
  selectAgent: (agentId: AgentId) => void;
  setHoverNode: (nodeId: NodeId | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  draftFor: (agentId: AgentId) => OrderDraft;
  setDraft: (agentId: AgentId, draft: OrderDraft) => void;
  clearDraft: (agentId: AgentId) => void;
  /** Called on ROUND_RESOLVED — opens the step-through at REVEALED_AT_START. */
  enterResolution: (log: readonly ResolutionEvent[]) => void;
  /** One more event revealed, per stepThrough.ts's `advance`. */
  advanceReveal: (log: readonly ResolutionEvent[]) => void;
  /** Continue to Round N — closes the step-through and returns to composing. */
  exitResolution: () => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  selectedAgentId: null,
  draftByAgent: {},
  hoverNodeId: null,
  connectionStatus: 'connecting',
  matchSubState: 'ORDERS',
  reveal: null,
  selectAgent: (agentId) => set({ selectedAgentId: agentId }),
  setHoverNode: (nodeId) => set({ hoverNodeId: nodeId }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  draftFor: (agentId) => get().draftByAgent[agentId as string] ?? emptyDraft(),
  setDraft: (agentId, draft) =>
    set((s) => ({ draftByAgent: { ...s.draftByAgent, [agentId as string]: draft } })),
  clearDraft: (agentId) =>
    set((s) => {
      const next = { ...s.draftByAgent };
      delete next[agentId as string];
      return { draftByAgent: next };
    }),
  enterResolution: (log) => set({ matchSubState: 'RESOLUTION', reveal: initialReveal(log) }),
  advanceReveal: (log) =>
    set((s) => ({ reveal: advance(s.reveal ?? initialReveal(log), log) })),
  exitResolution: () => set({ matchSubState: 'ORDERS', reveal: null }),
}));
