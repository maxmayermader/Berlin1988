import { CODENAME_MAX_LENGTH } from './identity.js';

/**
 * The single source of human-readable event/label text — apps/web/lib/CLAUDE.md
 * rule 5: keeping this in one place means the visual string and the
 * screen-reader announcement can never drift apart.
 */

/**
 * 01-UI-SPEC.md's exact copy for a server-rejected order, with `{reason}`
 * filled from the server's own rejection message — never a raw stack trace.
 */
export function orderRejectionText(reason: string): string {
  return `Your order couldn't be submitted — ${reason}. Fix it and resubmit before the timer runs out.`;
}

/** The 20-character ellipsis rule (01-UI-SPEC.md overflow row), applied
 *  anywhere a codename renders as a label. Codenames are already capped at
 *  entry (apps/web/lib/identity.ts), so this is a defensive backstop for
 *  any value that reaches this module some other way. */
export function truncateCodename(name: string): string {
  if (name.length <= CODENAME_MAX_LENGTH) return name;
  return `${name.slice(0, CODENAME_MAX_LENGTH - 1)}…`;
}
