import { cardId, type CardId, type Loadout } from '@berlin/shared';

/**
 * The four starter loadouts from docs/GAME_DESIGN.md §6.4. Each is exactly 10
 * cards, ≤3 per icon, ≥2 colors, and within the Budget Point ceiling —
 * validated by tests/loadout.test.ts so content edits can't quietly break them.
 */

const ids = (...xs: string[]): Loadout => xs.map(cardId) as CardId[];

/**
 * Never gets caught, rarely kills, wins on dossiers.
 * DECOY 3 · AGENT 3 · WIRETAP 2 · SAFEHOUSE 1 · BRIBE 1 — 25 BP
 */
export const PHANTOM: Loadout = ids(
  'dc_green', 'dc_blue', 'ps_ghost',
  'ps_dead_drop', 'ps_tunnel_rat', 'ag_green',
  'wt_blue', 'wt_green',
  'sh_green',
  'br_green',
);

/**
 * Finds you, then makes the noise worth it.
 * STRIKE 3 · WIRETAP 3 · DECOY 1 · SAFEHOUSE 1 · BRIBE 1 · AGENT 1 — 26 BP
 */
export const HUNTER: Loadout = ids(
  'st_red', 'st_blue', 'ps_k9',
  'wt_blue', 'wt_red', 'ps_counter_surv',
  'dc_blue',
  'sh_red',
  'ps_sleeper',
  'ag_red',
);

/**
 * Owns the map's income and its schedule, wins long.
 * BRIBE 3 · SAFEHOUSE 2 · WIRETAP 2 · AGENT 2 · STRIKE 1 — 26 BP
 */
export const OLIGARCH: Loadout = ids(
  'br_gold', 'br_red', 'ps_bagman',
  'sh_gold', 'ps_kontrolle',
  'wt_gold', 'wt_red',
  'ps_papers', 'ag_gold',
  'st_gold',
);

/**
 * Baits you into ground it already owns. Leans on Strike Mode B.
 * STRIKE 3 · SAFEHOUSE 2 · WIRETAP 2 · AGENT 1 · BRIBE 1 · DECOY 1 — 25 BP
 */
export const SPIDER: Loadout = ids(
  'st_red', 'st_green', 'ps_k9',
  'sh_red', 'sh_green',
  'wt_red', 'ps_cutout',
  'ps_dead_drop',
  'br_red',
  'dc_red',
);

export const STARTER_LOADOUTS: Record<string, Loadout> = {
  PHANTOM,
  HUNTER,
  OLIGARCH,
  SPIDER,
};
