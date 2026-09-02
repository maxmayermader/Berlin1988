import { PERSONALITIES } from '@berlin/ai';
import type { RoomSeat } from './state.js';

/**
 * Renders an AI-controlled seat's public readout as "{Personality name} the
 * {Title}" (LOBBY-07, D-09) — e.g. "Katja Reiner the Ghost". Both fields
 * already exist on `Personality` in `packages/ai/src/personalities/index.ts`
 * (verified before writing this file, per 03-RESEARCH.md Pitfall 4 — D-09's
 * "must add a title lookup" claim is stale); this function only formats and
 * exposes them, it does not invent a second source for the text.
 *
 * Lives in its own module rather than in `state.ts` or `bots.ts` to avoid an
 * import cycle: `bots.ts` already imports types from `state.ts`, so
 * `state.ts` importing a function back out of `bots.ts` would close that
 * loop. `state.ts`'s `toSnapshot` imports this function instead — this
 * module's own import of `RoomSeat` from `state.ts` is type-only, so it
 * compiles away and introduces no runtime cycle between the two files.
 */
export function aiReadoutFor(seat: RoomSeat): string | null {
  if (seat.controlledBy !== 'AI' || seat.personality === null) return null;
  const personality = PERSONALITIES[seat.personality];
  // Personality.title is already "The X" (docs/AI_OPPONENTS.md's own
  // convention, e.g. 'The Ghost') — strip the leading "The " so joining
  // with the fixed word "the" below produces "Katja Reiner the Ghost"
  // rather than "Katja Reiner the The Ghost".
  const title = personality.title.replace(/^The /, '');
  return `${personality.name} the ${title}`;
}
