import { cardId, type ActiveCard, type Card, type CardId, type PassiveCard } from '@berlin/shared';

/**
 * Card content. Data only — a card declares WHAT it does via icon/effect;
 * src/resolution decides HOW. No branching logic in this file.
 */

const active = (
  id: string,
  name: string,
  icon: ActiveCard['icon'],
  sector: ActiveCard['sector'],
  intelCost: number,
  cooldown: number,
  budgetPoints: number,
  text: string,
): ActiveCard => ({
  kind: 'ACTIVE',
  id: cardId(id),
  name,
  icon,
  sector,
  intelCost,
  cooldown,
  budgetPoints,
  text,
});

const passive = (
  id: string,
  name: string,
  icon: PassiveCard['icon'],
  sector: PassiveCard['sector'],
  effect: PassiveCard['effect'],
  consumable: boolean,
  budgetPoints: number,
  text: string,
): PassiveCard => ({
  kind: 'PASSIVE',
  id: cardId(id),
  name,
  icon,
  sector,
  effect,
  consumable,
  budgetPoints,
  text,
});

/** 24 actives: the six operations in four colors. */
export const ACTIVE_CARDS: readonly ActiveCard[] = [
  // WIRETAP
  active('wt_red', 'Stasi Listening Post', 'WIRETAP', 'RED', 2, 1, 2, 'Scan a node.'),
  active('wt_blue', 'CIA Signals Net', 'WIRETAP', 'BLUE', 2, 1, 3, 'Scan a node. In a BLUE sector, also scans every adjacent node.'),
  active('wt_gold', 'Embassy Wire', 'WIRETAP', 'GOLD', 2, 1, 2, 'Scan a node.'),
  active('wt_green', 'Tunnel Microphone', 'WIRETAP', 'GREEN', 2, 1, 2, 'Scan a node.'),

  // BRIBE
  active('br_red', 'Party Official', 'BRIBE', 'RED', 2, 2, 2, 'Claim the informant on your node.'),
  active('br_blue', 'Bank Transfer', 'BRIBE', 'BLUE', 2, 2, 2, 'Claim the informant on your node.'),
  active('br_gold', 'Diplomatic Pouch', 'BRIBE', 'GOLD', 2, 2, 3, 'Claim the informant on your node. In a GOLD sector, +2 Intel immediately.'),
  active('br_green', 'Black Market Contact', 'BRIBE', 'GREEN', 2, 2, 2, 'Claim the informant on your node.'),

  // DECOY
  active('dc_red', 'False Defector', 'DECOY', 'RED', 3, 2, 2, 'Place a decoy within 2 nodes.'),
  active('dc_blue', 'Phantom Broadcast', 'DECOY', 'BLUE', 3, 2, 2, 'Place a decoy within 2 nodes.'),
  active('dc_gold', 'Paper Agent', 'DECOY', 'GOLD', 3, 2, 2, 'Place a decoy within 2 nodes.'),
  active('dc_green', 'U-Bahn Double', 'DECOY', 'GREEN', 3, 2, 3, 'Place a decoy within 2 nodes. In a GREEN sector, swap places with it.'),

  // SAFEHOUSE
  active('sh_red', 'Plattenbau Flat', 'SAFEHOUSE', 'RED', 2, 3, 2, 'Place or relocate your safehouse to your node.'),
  active('sh_blue', 'Kreuzberg Attic', 'SAFEHOUSE', 'BLUE', 2, 3, 3, 'Place or relocate your safehouse. In a BLUE sector, costs no action.'),
  active('sh_gold', 'Consulate Annexe', 'SAFEHOUSE', 'GOLD', 2, 3, 2, 'Place or relocate your safehouse to your node.'),
  active('sh_green', 'Disused Platform', 'SAFEHOUSE', 'GREEN', 2, 3, 2, 'Place or relocate your safehouse to your node.'),

  // STRIKE (both modes live on the same card)
  active('st_red', 'Wet Work', 'STRIKE', 'RED', 3, 2, 4, 'Strike an adjacent node, or set an ambush. In a RED sector, a confirmed burn refunds 2 Intel.'),
  active('st_blue', 'Sanctioned Removal', 'STRIKE', 'BLUE', 3, 2, 3, 'Strike an adjacent node, or set an ambush.'),
  active('st_gold', 'Accident Abroad', 'STRIKE', 'GOLD', 3, 2, 3, 'Strike an adjacent node, or set an ambush.'),
  active('st_green', 'Garrotte in the Dark', 'STRIKE', 'GREEN', 3, 2, 3, 'Strike an adjacent node, or set an ambush.'),

  // AGENT — movement upgrades. Free movement needs no card; these are cheap Sprints.
  active('ag_red', 'Border Guard Pass', 'AGENT', 'RED', 0, 1, 1, 'Sprint two nodes for free.'),
  active('ag_blue', 'Staff Car', 'AGENT', 'BLUE', 0, 1, 1, 'Sprint two nodes for free.'),
  active('ag_gold', 'Corridor Transit', 'AGENT', 'GOLD', 0, 1, 1, 'Sprint two nodes for free.'),
  active('ag_green', 'Night Train', 'AGENT', 'GREEN', 0, 1, 2, 'Sprint two nodes for free, ignoring tunnel tolls.'),
];

/** The 10 passives from docs/GAME_DESIGN.md §6.2. */
export const PASSIVE_CARDS: readonly PassiveCard[] = [
  passive('ps_dead_drop', 'Dead Drop', 'AGENT', 'GREEN', 'DEAD_DROP', true, 3, 'Survive one ambush. Relocate to your safehouse or the nearest U-Bahn station.'),
  passive('ps_k9', 'K9 Unit', 'STRIKE', 'RED', 'K9_UNIT', true, 3, 'On a neutral contested node, +25% to win the roll.'),
  passive('ps_ghost', 'Ghost Protocol', 'DECOY', 'GREEN', 'GHOST_PROTOCOL', true, 4, 'One strike that would burn you misses.'),
  passive('ps_tunnel_rat', 'Tunnel Rat', 'AGENT', 'GREEN', 'TUNNEL_RAT', true, 2, 'Survive one blockade. Relocate and lose 1 action next round.'),
  passive('ps_counter_surv', 'Counter-Surveillance', 'WIRETAP', 'BLUE', 'COUNTER_SURVEILLANCE', true, 3, 'One wiretap that finds you returns CLEAR instead.'),
  passive('ps_kontrolle', 'Kontrolle Schedule', 'SAFEHOUSE', 'GOLD', 'KONTROLLE_SCHEDULE', false, 5, 'See every blockade for the whole match.'),
  passive('ps_papers', 'Forged Papers', 'AGENT', 'GOLD', 'FORGED_PAPERS', false, 3, 'Checkpoint crossings are free and emit no signal.'),
  passive('ps_cutout', 'Cutout', 'WIRETAP', 'BLUE', 'CUTOUT', false, 2, 'Your first 3 Burn Track entries hide their color.'),
  passive('ps_sleeper', 'Sleeper Cell', 'BRIBE', 'RED', 'SLEEPER_CELL', false, 3, "When one of your agents is burned, learn the killer's node."),
  passive('ps_bagman', 'Bagman', 'BRIBE', 'GOLD', 'BAGMAN', false, 3, '+1 Intel per round.'),
];

export const ALL_CARDS: readonly Card[] = [...ACTIVE_CARDS, ...PASSIVE_CARDS];

const BY_ID = new Map<string, Card>(ALL_CARDS.map((c) => [c.id as string, c]));

export function getCard(id: CardId): Card {
  const c = BY_ID.get(id as string);
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}

export function tryGetCard(id: CardId): Card | undefined {
  return BY_ID.get(id as string);
}

export function isActive(c: Card): c is ActiveCard {
  return c.kind === 'ACTIVE';
}

export function isPassive(c: Card): c is PassiveCard {
  return c.kind === 'PASSIVE';
}
