/**
 * The curated flavor-prompt set (CHAT-03, D-12) — hand-authored, reviewed,
 * Cold War table-talk lines, verbatim from 03-UI-SPEC.md's Copywriting
 * Contract flavor-prompts row. Modelled on apps/web/lib/identity.ts's
 * codename-pool comment: this is a fixed pool, fully reviewable at review
 * time, deliberately not generated, templated, or assembled at runtime — so
 * every line a player can ever broadcast through the prompt path has
 * already been read by a human. The same list serves both the lobby and an
 * in-progress match (D-12 left that open; identical is the simpler choice).
 */
export const FLAVOR_PROMPTS: readonly string[] = [
  'Berlin is nice this time of year.',
  'Trust no one — especially the quiet ones.',
  'I have a friend at the Ministry.',
  'Some doors are better left unopened.',
  'The wall has ears.',
  'Nice weather for a defection.',
  'I know a guy who knows a guy.',
  'Keep your friends close and your dossiers closer.',
  'This round smells like a setup.',
  'See you on the other side.',
];

/**
 * Resolves a client-supplied index into its reviewed line, or null for a
 * non-integer or out-of-range index. The client never supplies prompt text
 * itself — only this index — so a client can never broadcast an unreviewed
 * line through the prompt path (T-03-17).
 */
export function promptText(id: number): string | null {
  if (!Number.isInteger(id) || id < 0 || id >= FLAVOR_PROMPTS.length) return null;
  return FLAVOR_PROMPTS[id] ?? null;
}
