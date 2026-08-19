import type { GameState, ResolutionEvent } from '@berlin/shared';
import { emit, grant, makeContext, type RoundContext } from './ctx.js';
import { stepArm } from './arm.js';
import { stepTraps } from './traps.js';
import { stepDecoys } from './decoys.js';
import { stepMovement } from './movement.js';
import { stepTrapTriggers } from './trapTriggers.js';
import { stepBlockades } from './blockades.js';
import { stepBribes } from './bribes.js';
import { stepWiretaps } from './wiretaps.js';
import { stepStrikes } from './strikes.js';
import { stepContested } from './contested.js';
import { stepObjectives } from './objectives.js';
import { tickCooldowns } from '../cooldowns.js';
import { hasPassive } from '../passives.js';
import { checkVictory } from '../victory.js';
import { generateSignals } from '../fog/signals.js';
import { nextInt } from '../rng.js';

/**
 * Advance one full round.
 *
 * The eleven steps run in a FIXED, PUBLISHED order (docs/GAME_DESIGN.md §7.2).
 * That order is a game-design decision, not an implementation detail — it is
 * why "shoot where they're going, not where they are" is the skill ceiling.
 * Do not reorder it to make code convenient.
 *
 * Returns new state. The caller keeps the old one to animate the transition.
 */
export function resolveRound(state: GameState): {
  state: GameState;
  log: ResolutionEvent[];
} {
  const draft = structuredClone(state) as GameState;
  const ctx = makeContext(draft);

  emit(ctx, { type: 'ROUND_START', round: draft.round });

  stepArm(ctx); //  1. safehouses, silencers
  stepTraps(ctx); //  2. ambushes set
  stepDecoys(ctx); //  3. decoys placed
  stepMovement(ctx); //  4. everyone moves at once
  stepTrapTriggers(ctx); //  5. who walked into what
  stepBlockades(ctx); //  6. the city closes
  stepBribes(ctx); //  7. informants
  stepWiretaps(ctx); //  8. scans, from post-move positions
  stepStrikes(ctx); //  9. strikes, after scans
  stepContested(ctx); // 10. the ladder
  stepObjectives(ctx); // 11. dossiers, extraction

  upkeep(ctx);

  const outcome = checkVictory(draft);
  if (outcome) {
    draft.outcome = outcome;
    draft.phase = 'FINISHED';
    emit(ctx, { type: 'MATCH_ENDED', reason: outcome.reason, winners: outcome.winners });
  } else {
    draft.phase = 'ORDERS';
  }

  draft.lastRoundLog = ctx.log;
  draft.signals = generateSignals(draft, ctx.log);
  draft.pendingOrders = {};

  return { state: draft, log: ctx.log };
}

/**
 * Upkeep: Intel income, expiry sweeps, dossier respawns, cooldown ticks.
 * Runs inside the round so the whole thing stays one atomic transition.
 */
function upkeep(ctx: RoundContext): void {
  const state = ctx.state;
  const rs = state.ruleset;

  for (const pid of state.playerOrder) {
    const p = state.players[pid as string]!;
    if (p.eliminated) continue;

    const alive = p.agents.filter((a) => a.alive).length;
    if (alive === 0) continue;

    let income = rs.intelPerRound + Math.max(0, alive - 1) * rs.intelPerExtraAgent;
    for (const n of Object.values(state.nodes)) {
      if (n.informantOwner === p.id) income += rs.intelPerInformant;
    }
    if (hasPassive(p, 'BAGMAN')) income += 1;

    // Held actions bank Intel, so a timeout is wasteful rather than fatal.
    for (const agent of p.agents) {
      if (!agent.alive) continue;
      const order = state.pendingOrders[agent.id as string];
      const held = order
        ? order.actions.filter((a) => a.type === 'HOLD').length
        : rs.actionsPerAgent;
      income += held * rs.intelPerHeldAction;
    }

    const gained = grant(p, income, rs.intelCap);
    if (gained > 0) emit(ctx, { type: 'INTEL_GAINED', playerId: p.id, amount: gained });

    tickCooldowns(p);

    for (const agent of p.agents) {
      if (agent.actionPenalty > 0) agent.actionPenalty = 0;
    }
  }

  state.traps = state.traps.filter((t) => t.expiresAfterRound >= state.round);
  state.decoys = state.decoys.filter((d) => d.expiresAfterRound >= state.round);

  respawnDossiers(ctx);

  state.round += 1;
}

/** A taken dossier reappears on a random open node a couple of rounds later. */
function respawnDossiers(ctx: RoundContext): void {
  const state = ctx.state;
  const due = state.dossierRespawns.filter((r) => r <= state.round);
  if (due.length === 0) return;
  state.dossierRespawns = state.dossierRespawns.filter((r) => r > state.round);

  const open = Object.entries(state.nodes)
    .filter(([, n]) => n.blockadedUntil === null || n.blockadedUntil <= state.round)
    .map(([key]) => key)
    .sort();
  if (open.length === 0) return;

  for (let i = 0; i < due.length; i++) {
    const key = open[nextInt(state.rng, open.length)]!;
    state.nodes[key]!.dossiers += 1;
    emit(ctx, { type: 'DOSSIER_SPAWNED', nodeId: key as never });
  }
}

export { makeContext };
