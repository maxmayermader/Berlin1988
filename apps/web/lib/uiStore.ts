import { create } from 'zustand';
import type { AgentId, NodeId } from '@berlin/shared';
import { emptyDraft, type OrderDraft } from './orderDraft.js';

/**
 * Session and UI state only — apps/web/CLAUDE.md rule 5. The projected view
 * lives in matchStore and is never duplicated here: this store holds the
 * player's own in-progress composition (selection, per-agent draft, hover),
 * plus the connection's own lifecycle state.
 */

export type ConnectionStatus = 'connecting' | 'open' | 'lost';

interface UiStore {
  readonly selectedAgentId: AgentId | null;
  /** Keyed by agentId. */
  readonly draftByAgent: Readonly<Record<string, OrderDraft>>;
  readonly hoverNodeId: NodeId | null;
  readonly connectionStatus: ConnectionStatus;
  selectAgent: (agentId: AgentId) => void;
  setHoverNode: (nodeId: NodeId | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  draftFor: (agentId: AgentId) => OrderDraft;
  setDraft: (agentId: AgentId, draft: OrderDraft) => void;
  clearDraft: (agentId: AgentId) => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  selectedAgentId: null,
  draftByAgent: {},
  hoverNodeId: null,
  connectionStatus: 'connecting',
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
}));
