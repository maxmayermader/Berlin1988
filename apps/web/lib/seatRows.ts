import type { LobbySnapshot } from '@berlin/shared';

/**
 * The seat list's rules — badge selection, AI flagging, row order, ready
 * summary, countdown visibility, kick-button visibility — as a pure view
 * model, no React. Asserted on the values this module returns, never on
 * rendered DOM: this phase ships no React component-testing stack (see
 * 01-02-PLAN.md's <testing_note>), so this is where these rules become
 * unit-testable at all.
 */

export const READY_BADGE_TEXT = 'Ready ✓';
export const NOT_READY_BADGE_TEXT = 'Not ready';

export interface SeatRow {
  readonly index: number;
  readonly playerId: string | null;
  readonly label: string | null;
  readonly kind: 'HUMAN' | 'BOT' | 'OPEN';
  readonly badgeText: string | null;
  readonly isAi: boolean;
  /** Whether a Kick button should render on this row. True only when the
   *  viewer is the host, the row is occupied (not OPEN), and the row is not
   *  the host's own seat. Kick-button visibility is a rule, and rules live
   *  here — SeatList.tsx must not re-derive it. */
  readonly canKick: boolean;
}

/**
 * One row per seat, in `snapshot.seats` array order — never sorted, never
 * filtered, never re-derived from ready state. Row position is the index
 * the room assigned at join time (apps/party/src/state.ts), so a ready
 * toggle can never reorder the list. An open seat carries no ready badge
 * and no placeholder name — a chair nobody is sitting in has neither.
 *
 * `viewer` is optional and defaults to null (no viewer identity known yet,
 * e.g. before JOINED has arrived) — every row's `canKick` is false in that
 * case.
 */
export function seatRows(
  snapshot: LobbySnapshot,
  viewer: { playerId: string | null } | null = null,
): SeatRow[] {
  const viewerIsHost = viewer !== null && viewer.playerId === snapshot.hostPlayerId;

  return snapshot.seats.map((seat) => {
    if (seat.kind === 'OPEN') {
      return {
        index: seat.index,
        playerId: null,
        label: null,
        kind: 'OPEN',
        badgeText: null,
        isAi: false,
        canKick: false,
      };
    }
    return {
      index: seat.index,
      playerId: seat.playerId,
      label: seat.codename,
      kind: seat.kind,
      badgeText: seat.ready ? READY_BADGE_TEXT : NOT_READY_BADGE_TEXT,
      // A bot seat must never be presented as though a human occupies it
      // (this plan's threat-model prohibition) — proven on this value by
      // seatRows.test.ts rather than by reading the component.
      isAi: seat.kind === 'BOT',
      canKick: viewerIsHost && seat.playerId !== snapshot.hostPlayerId,
    };
  });
}

/** "N of M ready", counting only filled seats on both sides. An all-open
 *  snapshot returns zeroes without dividing. */
export function readySummary(snapshot: LobbySnapshot): { ready: number; filled: number } {
  const filled = snapshot.seats.filter((seat) => seat.kind !== 'OPEN');
  const ready = filled.filter((seat) => seat.ready).length;
  return { ready, filled: filled.length };
}

/**
 * The client's whole countdown-visibility signal is the presence of the
 * server's startsAt. Do not recompute the 50% threshold here — that
 * authority lives solely in apps/party/src/state.ts's recomputeCountdown;
 * a second implementation on the client would eventually disagree with it
 * about whether a countdown is running, the same class of bug
 * apps/web/CLAUDE.md rule 6 forbids for the clock value itself.
 */
export function shouldShowCountdown(snapshot: LobbySnapshot): boolean {
  return snapshot.startsAt !== null;
}
