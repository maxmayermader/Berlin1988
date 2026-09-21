import type {
  Difficulty,
  MatchSettings,
  OutcomeReason,
  PersonalityId,
  PlayerId,
  SeatConfig,
  Sector,
} from '@berlin/shared';
import {
  createMatch,
  resolveRound,
  submitOrder,
  viewForOrdering,
  quickSettings,
  scoreOf,
} from '@berlin/engine';
import { mapIdForPlayerCount, playerId } from '@berlin/shared';
import { createAgent, type AIAgent } from '../src/index.js';

/** One headless bot-vs-bot match. No UI, no network, no I/O in the hot loop. */

export interface SeatSpec {
  readonly personality: PersonalityId;
  readonly difficulty: Difficulty;
  readonly faction?: Sector;
}

export interface MatchResult {
  readonly seed: string;
  readonly rounds: number;
  readonly reason: OutcomeReason;
  readonly winners: readonly string[];
  readonly perSeat: readonly SeatResult[];
}

export interface SeatResult {
  readonly id: string;
  readonly personality: PersonalityId;
  readonly difficulty: Difficulty;
  readonly won: boolean;
  readonly score: number;
  readonly intel: number;
  readonly agentsAlive: number;
  readonly burnsInflicted: number;
  readonly dossiersExtracted: number;
  /** Action histogram — the raw material for the distinguishability gate. */
  readonly actions: Record<string, number>;
  readonly distanceTravelled: number;
  /** Agents lost to a blockade — the direct measure of self-preservation. */
  readonly blockadeDeaths: number;
  readonly decisionMs: number[];
}

const FACTIONS: Sector[] = ['BLUE', 'RED', 'GOLD', 'GREEN'];

export function runMatch(
  seed: string,
  seats: readonly SeatSpec[],
  overrides: Partial<MatchSettings> = {},
): MatchResult {
  const seatConfigs: SeatConfig[] = seats.map((s, i) => ({
    id: playerId(`p${i + 1}`),
    name: `${s.personality}/${s.difficulty}`,
    faction: s.faction ?? FACTIONS[i % FACTIONS.length]!,
    kind: 'BOT' as const,
    team: null,
  }));

  // The map follows the seat count the same way a real match's does
  // (MAP-03) — a 3- or 4-player sweep on the duel map would be measuring a
  // board nobody will ever play those counts on. An explicit `mapId`
  // override still wins, so a sweep can pin one map deliberately.
  const settings = quickSettings({
    seats: seatConfigs,
    mapId: mapIdForPlayerCount(seatConfigs.length),
    ...overrides,
  });
  let state = createMatch(settings, seed);

  const bots = new Map<string, AIAgent>();
  for (let i = 0; i < seats.length; i++) {
    const spec = seats[i]!;
    bots.set(
      seatConfigs[i]!.id as string,
      createAgent(spec.personality, spec.difficulty, `${seed}:s${i}`),
    );
  }

  const stats = new Map<
    string,
    { actions: Record<string, number>; dist: number; ms: number[]; blockadeDeaths: number }
  >();
  for (const c of seatConfigs) {
    stats.set(c.id as string, { actions: {}, dist: 0, ms: [], blockadeDeaths: 0 });
  }

  let guard = 0;
  const maxRounds = settings.roundLimit + 5;

  while (state.phase === 'ORDERS' && guard++ < maxRounds) {
    for (const pid of state.playerOrder) {
      const player = state.players[pid as string]!;
      if (player.eliminated) continue;
      const bot = bots.get(pid as string)!;
      const st = stats.get(pid as string)!;

      for (const agent of player.agents) {
        if (!agent.alive) continue;

        // viewForOrdering, not projectView — a player's agents share one Intel
        // pool, so the second must see what the first already committed.
        const view = viewForOrdering(state, pid, agent.id as string);

        const t0 = performance.now();
        const actions = bot.decide(view, agent.id);
        st.ms.push(performance.now() - t0);

        for (const a of actions) {
          st.actions[a.type] = (st.actions[a.type] ?? 0) + 1;
          if (a.type === 'MOVE') st.dist += 1;
          if (a.type === 'SPRINT') st.dist += 2;
        }

        const res = submitOrder(state, pid, { agentId: agent.id, actions });
        if (res.rejection) {
          throw new Error(
            `${bot.personality}/${bot.difficulty} produced an illegal order: ` +
              `${res.rejection.code} ${res.rejection.message}`,
          );
        }
        state = res.state;
      }
    }
    const resolved = resolveRound(state);
    for (const ev of resolved.log) {
      if (ev.type === 'BLOCKADE_CAUGHT' && !ev.survived) {
        const st = stats.get(ev.playerId as string);
        if (st) st.blockadeDeaths += 1;
      }
    }
    state = resolved.state;
  }

  const outcome = state.outcome ?? { reason: 'ROUND_LIMIT' as OutcomeReason, winners: [] };
  const winners = new Set(outcome.winners.map((w) => w as string));

  const perSeat: SeatResult[] = state.playerOrder.map((pid, i) => {
    const p = state.players[pid as string]!;
    const st = stats.get(pid as string)!;
    return {
      id: pid as string,
      personality: seats[i]!.personality,
      difficulty: seats[i]!.difficulty,
      won: winners.has(pid as string),
      score: scoreOf(state, pid as PlayerId),
      intel: p.intel,
      agentsAlive: p.agents.filter((a) => a.alive).length,
      burnsInflicted: p.burnsInflicted,
      dossiersExtracted: p.dossiersExtracted,
      actions: st.actions,
      distanceTravelled: st.dist,
      blockadeDeaths: st.blockadeDeaths,
      decisionMs: st.ms,
    };
  });

  return {
    seed,
    rounds: state.round,
    reason: outcome.reason,
    winners: [...winners],
    perSeat,
  };
}
