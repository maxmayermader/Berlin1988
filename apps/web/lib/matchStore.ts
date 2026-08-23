import { create } from 'zustand';
import type { LobbySnapshot, PlayerView } from '@berlin/shared';

/** Per-agent order status, keyed by agent id. Reconciled from the room's
 *  own ORDER_ACK/ORDER_REJECTED reply — never assumed from the send alone
 *  (apps/web/lib/CLAUDE.md rule 4: optimistic preview is advisory, the
 *  server's answer wins). */
export interface OrderStatus {
  readonly state: 'idle' | 'pending' | 'accepted' | 'rejected';
  readonly message?: string;
}

/** One seat's public commit count, from an OPPONENT_COMMITTED frame.
 *  Content-free by construction — count only, never order actions. */
export interface CommittedCount {
  readonly committed: number;
  readonly total: number;
}

/**
 * Holds the current LobbySnapshot for the lobby screen and, from the
 * LOADOUT -> IN_GAME transition onward, exactly one PlayerView — never a
 * client-side mirror of the server's full authoritative state
 * (apps/web/lib/CLAUDE.md rule 2). Session/UI-only, per apps/web/CLAUDE.md
 * rule 5.
 */
interface MatchStore {
  readonly snapshot: LobbySnapshot | null;
  readonly view: PlayerView | null;
  /** Keyed by playerId. */
  readonly committed: Record<string, CommittedCount>;
  /** Keyed by agentId. */
  readonly orderStatus: Record<string, OrderStatus>;
  setSnapshot: (snapshot: LobbySnapshot) => void;
  setView: (view: PlayerView) => void;
  setCommitted: (playerId: string, committed: number, total: number) => void;
  setOrderStatus: (agentId: string, status: OrderStatus) => void;
  /** Called on ROUND_RESOLVED — commit counts are round-scoped and must not
   *  carry over once a fresh order phase opens. */
  resetCommitted: () => void;
}

export const useMatchStore = create<MatchStore>((set) => ({
  snapshot: null,
  view: null,
  committed: {},
  orderStatus: {},
  setSnapshot: (snapshot) => set({ snapshot }),
  setView: (view) => set({ view }),
  setCommitted: (playerId, committed, total) =>
    set((s) => ({ committed: { ...s.committed, [playerId]: { committed, total } } })),
  setOrderStatus: (agentId, status) =>
    set((s) => ({ orderStatus: { ...s.orderStatus, [agentId]: status } })),
  resetCommitted: () => set({ committed: {} }),
}));
