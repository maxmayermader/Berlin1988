import type { CardId, Loadout, LoadoutViolation, Ruleset } from '@berlin/shared';
import { tryGetCard } from './content/cards.js';

/** Loadout construction rules from docs/GAME_DESIGN.md §6.1. */
export function validateLoadout(
  loadout: Loadout,
  ruleset: Ruleset,
): LoadoutViolation[] {
  const out: LoadoutViolation[] = [];

  if (loadout.length !== ruleset.loadoutSize) {
    out.push({
      code: 'WRONG_SIZE',
      message: `Loadout must be exactly ${ruleset.loadoutSize} cards, got ${loadout.length}.`,
    });
  }

  const cards = [];
  for (const id of loadout) {
    const c = tryGetCard(id);
    if (!c) {
      out.push({ code: 'UNKNOWN_CARD', message: `Unknown card: ${id}` });
      continue;
    }
    cards.push(c);
  }

  const perIcon = new Map<string, number>();
  const colors = new Set<string>();
  let budget = 0;
  for (const c of cards) {
    perIcon.set(c.icon, (perIcon.get(c.icon) ?? 0) + 1);
    colors.add(c.sector);
    budget += c.budgetPoints;
  }

  for (const [icon, n] of perIcon) {
    if (n > ruleset.maxPerIcon) {
      out.push({
        code: 'ICON_LIMIT',
        message: `At most ${ruleset.maxPerIcon} ${icon} cards allowed, got ${n}.`,
      });
    }
  }

  if (colors.size < ruleset.minColors) {
    out.push({
      code: 'TOO_FEW_COLORS',
      message: `Loadout must use at least ${ruleset.minColors} colors, got ${colors.size}.`,
    });
  }

  if (budget > ruleset.maxBudgetPoints) {
    out.push({
      code: 'OVER_BUDGET',
      message: `Loadout costs ${budget} Budget Points, limit is ${ruleset.maxBudgetPoints}.`,
    });
  }

  return out;
}

export function budgetPointsOf(loadout: Loadout): number {
  let total = 0;
  for (const id of loadout) total += tryGetCard(id)?.budgetPoints ?? 0;
  return total;
}

/** The consumable passives in a loadout — what a player starts holding. */
export function consumablePassivesIn(loadout: Loadout): CardId[] {
  return loadout.filter((id) => {
    const c = tryGetCard(id);
    return c?.kind === 'PASSIVE' && c.consumable;
  });
}
