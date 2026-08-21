import { create } from 'zustand';
import type { LobbySnapshot, PlayerView } from '@berlin/shared';

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
  setSnapshot: (snapshot: LobbySnapshot) => void;
  setView: (view: PlayerView) => void;
}

export const useMatchStore = create<MatchStore>((set) => ({
  snapshot: null,
  view: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  setView: (view) => set({ view }),
}));
