/**
 * The countdown as pure arithmetic — apps/web/CLAUDE.md rule 6 and
 * apps/web/lib/CLAUDE.md rule 5: the displayed value is always recomputed
 * from the server's absolute `deadlineAt`, never from a local counter that
 * decrements on its own and can drift across a tab suspend.
 *
 * The clamp at zero is the whole point of `secondsRemaining`: the deadline
 * is a server timestamp, and a client whose own clock runs even slightly
 * fast will compute a negative remainder in the window between the deadline
 * passing and the resolution frame actually arriving. It must show 0 and
 * hold there, never a negative number and never a silent reset.
 */

export const URGENT_THRESHOLD_SECONDS = 10;

/** 0 for a null deadline (no round timer set yet) and never negative. */
export function secondsRemaining(deadlineAt: number | null, now: number): number {
  if (deadlineAt === null) return 0;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

/** `m:ss`, zero-padded seconds, no fractional component at any input. */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** A style-only urgency threshold (D-10: no animation beyond D-06's step
 *  transitions) — true at exactly URGENT_THRESHOLD_SECONDS and below. */
export function isUrgent(seconds: number): boolean {
  return seconds <= URGENT_THRESHOLD_SECONDS;
}
