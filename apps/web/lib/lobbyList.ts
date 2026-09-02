import type { DirectoryEntry } from '@berlin/shared';

/**
 * The Open Lobbies list's row-shaping rules, as a pure view model — no
 * React, no DOM, mirroring lib/seatRows.ts's exact conventions (a readonly
 * row interface, exported copy constants, one mapping function). This is
 * the sole place 03-UI-SPEC.md's Copywriting Contract row for the lobby-list
 * row and its empty/connecting-state copy are quoted, mirroring how
 * createJoin.ts owns UNKNOWN_CODE_MESSAGE.
 */

export interface LobbyRow {
  readonly key: string;
  readonly code: string;
  readonly hostLabel: string;
  readonly seatsLabel: string;
}

/** 03-UI-SPEC.md Copywriting Contract — Lobby-list empty state. */
export const EMPTY_HEADING = 'No open lobbies';
export const EMPTY_BODY =
  "No one's hosting right now. Create a game above, or check back in a moment.";

/** 03-UI-SPEC.md UI Considerations "loading" row — the pre-first-frame copy,
 *  matching the "Connecting…" pattern already used by
 *  apps/web/app/lobby/[code]/page.tsx and apps/web/app/match/[code]/page.tsx. */
export const CONNECTING_LABEL = 'Connecting…';

/**
 * One row per entry, in argument order — never sorted, filtered, deduped,
 * or clamped. Row position is the directory's own insertion order (see
 * apps/party/src/directory.ts), so this function must not re-derive an
 * order of its own. Entries are keyed by `code`, never by `hostCodename`,
 * so two lobbies with the same host codename still render as two distinct
 * rows (03-01-PLAN.md's collision-safety truth).
 */
export function lobbyRows(lobbies: readonly DirectoryEntry[]): LobbyRow[] {
  return lobbies.map((entry) => ({
    key: entry.code,
    code: entry.code,
    hostLabel: `${entry.hostCodename}'s lobby`,
    seatsLabel: `${entry.seatsFilled}/${entry.seatsTotal} filled`,
  }));
}
