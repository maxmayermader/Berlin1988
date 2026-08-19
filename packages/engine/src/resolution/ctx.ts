import type {
  Action,
  AgentState,
  BurnCause,
  BurnEntry,
  CardId,
  GameState,
  PassiveEffect,
  PlayerId,
  PlayerSecrets,
  ResolutionEvent,
} from '@berlin/shared';
import { getCard } from '../content/cards.js';
import { putOnCooldown } from '../cooldowns.js';
import { consumePassive, findPassive } from '../passives.js';

/** Scratch state threaded through the eleven resolution steps. */
export interface RoundContext {
  readonly state: GameState;
  readonly log: ResolutionEvent[];
  /** Node key → player ids contesting it this round (trap owners + strikers). */
  readonly claims: Map<string, Set<string>>;
  /** Agents burned this round, so later steps skip them. */
  readonly burned: Set<string>;
  /** Post-movement positions, captured once so scans and strikes agree. */
  readonly positions: Map<string, string>;
}

export function makeContext(state: GameState): RoundContext {
  return {
    state,
    log: [],
    claims: new Map(),
    burned: new Set(),
    positions: new Map(),
  };
}

export function emit(ctx: RoundContext, ev: ResolutionEvent): void {
  ctx.log.push(ev);
}

export interface CollectedAction<T extends Action['type']> {
  readonly player: PlayerSecrets;
  readonly agent: AgentState;
  readonly action: Extract<Action, { type: T }>;
}

/**
 * Gather every action of one type across all players, in a fixed order:
 * seat order, then agent order, then action index. Deterministic ordering here
 * is what makes "submission order never affects the outcome" true.
 */
export function collect<T extends Action['type']>(
  ctx: RoundContext,
  type: T,
): CollectedAction<T>[] {
  const out: CollectedAction<T>[] = [];
  for (const pid of ctx.state.playerOrder) {
    const player = ctx.state.players[pid as string]!;
    if (player.eliminated) continue;
    for (const agent of player.agents) {
      if (!agent.alive || ctx.burned.has(agent.id as string)) continue;
      const order = ctx.state.pendingOrders[agent.id as string];
      if (!order) continue;
      for (const action of order.actions) {
        if (action.type === type) {
          out.push({ player, agent, action: action as Extract<Action, { type: T }> });
        }
      }
    }
  }
  return out;
}

/** Where an agent is right now, according to this round's movement step. */
export function posOf(ctx: RoundContext, agent: AgentState): string {
  return ctx.positions.get(agent.id as string) ?? (agent.nodeId as string);
}

export function spend(p: PlayerSecrets, amount: number): boolean {
  if (p.intel < amount) return false;
  p.intel -= amount;
  return true;
}

export function grant(p: PlayerSecrets, amount: number, cap: number): number {
  const before = p.intel;
  p.intel = Math.min(cap, p.intel + amount);
  return p.intel - before;
}

/**
 * Record a card use: cooldown, Burn Track entry, public event.
 *
 * Cutout redaction is applied HERE, once, at append time — so every viewer
 * including the owner sees the identical redacted row and there is no
 * owner-only variant of a Burn Track to keep in sync.
 */
export function playCard(ctx: RoundContext, p: PlayerSecrets, id: CardId): void {
  const card = getCard(id);
  if (card.kind === 'ACTIVE') putOnCooldown(p, id, card.cooldown);
  appendBurn(ctx, p, {
    round: ctx.state.round,
    cardId: id,
    icon: card.icon,
    sector: card.sector,
    kind: card.kind,
    effect: card.kind === 'PASSIVE' ? card.effect : null,
  });
  emit(ctx, { type: 'CARD_PLAYED', playerId: p.id, cardId: id });
}

function appendBurn(ctx: RoundContext, p: PlayerSecrets, entry: BurnEntry): void {
  const track = ctx.state.burnTracks[p.id as string] ?? [];
  const cutout = findPassive(p, 'CUTOUT') !== null;
  const redact = cutout && track.length < 3;
  track.push(redact ? { ...entry, sector: null } : entry);
  ctx.state.burnTracks[p.id as string] = track;
}

/**
 * Try to fire a passive. Returns true if it triggered. Consumables are removed
 * and announced — surviving an ambush tells the table you had a Dead Drop and
 * no longer do.
 */
export function firePassive(
  ctx: RoundContext,
  p: PlayerSecrets,
  effect: PassiveEffect,
): boolean {
  const id = findPassive(p, effect);
  if (!id) return false;
  const consumed = consumePassive(p, id);
  appendBurn(ctx, p, {
    round: ctx.state.round,
    cardId: id,
    icon: getCard(id).icon,
    sector: getCard(id).sector,
    kind: 'PASSIVE',
    effect,
  });
  emit(ctx, { type: 'PASSIVE_FIRED', playerId: p.id, cardId: id, effect, consumed });
  return true;
}

/**
 * Burning is permanent — agents never respawn. This has to clean up after
 * itself: dossiers drop where the agent fell, and a player's last burn releases
 * their informants and clears their safehouse, decoys, and traps. Orphaned
 * state from a dead player is the likeliest source of "impossible" bugs later.
 */
export function burnAgent(
  ctx: RoundContext,
  agent: AgentState,
  cause: BurnCause,
  byPlayerId: PlayerId | null,
): void {
  if (!agent.alive) return;
  const state = ctx.state;
  const owner = state.players[agent.playerId as string]!;
  const node = posOf(ctx, agent);

  agent.alive = false;
  ctx.burned.add(agent.id as string);

  const dropped = agent.dossiers;
  if (dropped > 0) {
    state.nodes[node]!.dossiers += dropped;
    agent.dossiers = 0;
  }

  emit(ctx, {
    type: 'AGENT_BURNED',
    playerId: owner.id,
    agentId: agent.id,
    nodeId: agent.nodeId,
    byPlayerId,
    cause,
    dossiersDropped: dropped,
  });

  if (byPlayerId) {
    const killer = state.players[byPlayerId as string];
    if (killer && killer.id !== owner.id) killer.burnsInflicted += 1;
  }

  if (owner.agents.every((a) => !a.alive)) eliminate(ctx, owner);
}

function eliminate(ctx: RoundContext, p: PlayerSecrets): void {
  if (p.eliminated) return;
  p.eliminated = true;

  for (const n of Object.values(ctx.state.nodes)) {
    if (n.informantOwner === p.id) n.informantOwner = null;
  }
  p.safehouse = null;
  ctx.state.traps = ctx.state.traps.filter((t) => t.ownerId !== p.id);
  ctx.state.decoys = ctx.state.decoys.filter((d) => d.ownerId !== p.id);

  emit(ctx, { type: 'PLAYER_ELIMINATED', playerId: p.id });
}

/** Register a claim on a node — resolved by the contested step. */
export function claim(ctx: RoundContext, node: string, player: PlayerId): void {
  let set = ctx.claims.get(node);
  if (!set) {
    set = new Set();
    ctx.claims.set(node, set);
  }
  set.add(player as string);
}

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextEntityId++}`;
}

export function isBlocked(state: GameState, node: string): boolean {
  const n = state.nodes[node];
  return n?.blockadedUntil !== null && n !== undefined && n.blockadedUntil! > state.round;
}
