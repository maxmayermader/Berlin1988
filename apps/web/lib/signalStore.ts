import { create } from 'zustand';
import type { NodeId, Sector, Signal } from '@berlin/shared';
import { mergeSignals } from './signals.js';

/**
 * The signals log (INTEL-02). `PlayerView.signals` carries only the current
 * round's signals — the engine regenerates them every Upkeep — so the
 * client keeps the ones it has already been shown. This is not a mirror of
 * server state: it is the player's own notebook of messages the room
 * already delivered to them, exactly as delivered.
 *
 * Also holds the map highlight the player picked from the log, which is
 * pure UI state (apps/web/CLAUDE.md rule 5).
 */
interface SignalStore {
  /** Which match this log belongs to; a new match starts a fresh notebook. */
  readonly matchId: string | null;
  readonly log: readonly Signal[];
  readonly highlight: { readonly nodeId: NodeId | null; readonly sector: Sector | null } | null;
  ingest: (matchId: string, signals: readonly Signal[]) => void;
  setHighlight: (highlight: { nodeId: NodeId | null; sector: Sector | null } | null) => void;
}

export const useSignalStore = create<SignalStore>((set) => ({
  matchId: null,
  log: [],
  highlight: null,
  ingest: (matchId, signals) =>
    set((s) =>
      s.matchId === matchId
        ? { log: mergeSignals(s.log, signals) }
        : { matchId, log: mergeSignals([], signals), highlight: null },
    ),
  setHighlight: (highlight) => set({ highlight }),
}));
