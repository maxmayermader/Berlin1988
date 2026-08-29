import type { CardId } from '@berlin/shared';

/**
 * Cooldowns are per card, PER PLAYER — shared across both of a player's agents.
 * Two agents cannot double-tap the same ability in one round, which is the main
 * reason a second agent doubles your reach without doubling your firepower.
 */

export interface CooldownHolder {
  cooldowns: Record<string, number>;
}

export function isReady(p: { cooldowns: Readonly<Record<string, number>> }, id: CardId): boolean {
  return (p.cooldowns[id as string] ?? 0) <= 0;
}

export function remaining(
  p: { cooldowns: Readonly<Record<string, number>> },
  id: CardId,
): number {
  return p.cooldowns[id as string] ?? 0;
}

export function putOnCooldown(p: CooldownHolder, id: CardId, rounds: number): void {
  if (rounds > 0) p.cooldowns[id as string] = rounds;
}

/** Called once per player at Upkeep. */
export function tickCooldowns(p: CooldownHolder): void {
  for (const key of Object.keys(p.cooldowns)) {
    const v = p.cooldowns[key]!;
    if (v <= 1) delete p.cooldowns[key];
    else p.cooldowns[key] = v - 1;
  }
}
