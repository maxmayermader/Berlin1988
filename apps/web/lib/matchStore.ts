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
/** The room's server-authoritative round clock — apps/web/CLAUDE.md rule 6
 *  and apps/web/lib/CLAUDE.md rule 5: rendered from this absolute
 *  timestamp, never from a local counter that drifts. */
export interface ClockStore {
  readonly deadlineAt: number | null;
}

interface MatchStore {
  readonly snapshot: LobbySnapshot | null;
  readonly view: PlayerView | null;
  /** Keyed by playerId. */
  readonly committed: Record<string, CommittedCount>;
  /** Keyed by agentId. */
  readonly orderStatus: Record<string, OrderStatus>;
  readonly clock: ClockStore;
  setSnapshot: (snapshot: LobbySnapshot) => void;
  setView: (view: PlayerView) => void;
  setCommitted: (playerId: string, committed: number, total: number) => void;
  setOrderStatus: (agentId: string, status: OrderStatus) => void;
  setClock: (deadlineAt: number | null) => void;
  /** Called on ROUND_RESOLVED — commit counts are round-scoped and must not
   *  carry over once a fresh order phase opens. */
  resetCommitted: () => void;
  /**
   * Called on ROUND_RESOLVED alongside resetCommitted — order status is
   * round-scoped too. Without this, a status of 'accepted' from the round
   * that just resolved would permanently lock every ActionSlot's isActive
   * check (OrderComposer.tsx) and disable Submit for every subsequent
   * round, since nothing else ever transitions 'accepted' back to 'idle'.
   */
  resetOrderStatus: () => void;
}

export const useMatchStore = create<MatchStore>((set) => ({
  snapshot: null,
  view: null,
  committed: {},
  orderStatus: {},
  clock: { deadlineAt: null },
  setSnapshot: (snapshot) => set({ snapshot }),
  setView: (view) => set({ view, clock: { deadlineAt: view.clock.deadlineAt } }),
  setCommitted: (playerId, committed, total) =>
    set((s) => ({ committed: { ...s.committed, [playerId]: { committed, total } } })),
  setOrderStatus: (agentId, status) =>
    set((s) => ({ orderStatus: { ...s.orderStatus, [agentId]: status } })),
  setClock: (deadlineAt) => set({ clock: { deadlineAt } }),
  resetCommitted: () => set({ committed: {} }),
  resetOrderStatus: () => set({ orderStatus: {} }),
}));
