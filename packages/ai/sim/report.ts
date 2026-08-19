import type { Difficulty, PersonalityId } from '@berlin/shared';
import type { MatchResult, SeatResult } from './match.js';

/** Aggregation. Every balance claim in the docs is a hypothesis until this runs. */

export interface Aggregate {
  readonly matches: number;
  readonly avgRounds: number;
  readonly outcomes: Record<string, number>;
  readonly bySeatKey: Map<string, SeatAggregate>;
}

export interface SeatAggregate {
  readonly key: string;
  readonly personality: PersonalityId;
  readonly difficulty: Difficulty;
  games: number;
  wins: number;
  score: number;
  burns: number;
  dossiers: number;
  intel: number;
  agentsAlive: number;
  distance: number;
  actions: Record<string, number>;
  decisionMs: number[];
}

export function aggregate(results: readonly MatchResult[]): Aggregate {
  const outcomes: Record<string, number> = {};
  const bySeatKey = new Map<string, SeatAggregate>();
  let totalRounds = 0;

  for (const r of results) {
    totalRounds += r.rounds;
    outcomes[r.reason] = (outcomes[r.reason] ?? 0) + 1;

    for (const s of r.perSeat) {
      const key = `${s.personality}/${s.difficulty}`;
      let agg = bySeatKey.get(key);
      if (!agg) {
        agg = {
          key,
          personality: s.personality,
          difficulty: s.difficulty,
          games: 0,
          wins: 0,
          score: 0,
          burns: 0,
          dossiers: 0,
          intel: 0,
          agentsAlive: 0,
          distance: 0,
          actions: {},
          decisionMs: [],
        };
        bySeatKey.set(key, agg);
      }
      accumulate(agg, s);
    }
  }

  return {
    matches: results.length,
    avgRounds: results.length ? totalRounds / results.length : 0,
    outcomes,
    bySeatKey,
  };
}

function accumulate(agg: SeatAggregate, s: SeatResult): void {
  agg.games += 1;
  agg.wins += s.won ? 1 : 0;
  agg.score += s.score;
  agg.burns += s.burnsInflicted;
  agg.dossiers += s.dossiersExtracted;
  agg.intel += s.intel;
  agg.agentsAlive += s.agentsAlive;
  agg.distance += s.distanceTravelled;
  for (const [k, v] of Object.entries(s.actions)) {
    agg.actions[k] = (agg.actions[k] ?? 0) + v;
  }
  // Sampled, not exhaustive — a 10k sweep would otherwise hold millions of floats.
  if (agg.decisionMs.length < 20000) agg.decisionMs.push(...s.decisionMs);
}

export function winRate(a: SeatAggregate): number {
  return a.games ? a.wins / a.games : 0;
}

/** Fraction of a seat's actions that were of each type — the personality signature. */
export function actionProfile(a: SeatAggregate): Record<string, number> {
  let total = 0;
  for (const v of Object.values(a.actions)) total += v;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.actions)) out[k] = total ? v / total : 0;
  return out;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i]!;
}

/** L1 distance between two action profiles. Higher = more distinguishable. */
export function profileDistance(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let d = 0;
  for (const k of keys) d += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return d;
}

export function formatTable(agg: Aggregate): string {
  const rows = [...agg.bySeatKey.values()].sort((a, b) => winRate(b) - winRate(a));
  const lines: string[] = [];

  lines.push(
    `${agg.matches} matches · avg ${agg.avgRounds.toFixed(1)} rounds · ` +
      Object.entries(agg.outcomes)
        .map(([k, v]) => `${k} ${((v / agg.matches) * 100).toFixed(0)}%`)
        .join(', '),
  );
  lines.push('');
  lines.push(
    pad('seat', 26) +
      pad('win%', 7) +
      pad('score', 7) +
      pad('burns', 7) +
      pad('dsr', 6) +
      pad('intel', 7) +
      pad('alive', 7) +
      pad('dist', 6) +
      pad('p99ms', 7),
  );
  lines.push('-'.repeat(80));

  for (const r of rows) {
    lines.push(
      pad(r.key, 26) +
        pad((winRate(r) * 100).toFixed(1), 7) +
        pad((r.score / r.games).toFixed(1), 7) +
        pad((r.burns / r.games).toFixed(2), 7) +
        pad((r.dossiers / r.games).toFixed(2), 6) +
        pad((r.intel / r.games).toFixed(1), 7) +
        pad((r.agentsAlive / r.games).toFixed(2), 7) +
        pad((r.distance / r.games).toFixed(1), 6) +
        pad(percentile(r.decisionMs, 99).toFixed(2), 7),
    );
  }

  return lines.join('\n');
}

/** Action mix per seat — the personality signature, and the first thing to
 *  check when win rates look wrong. */
export function formatProfiles(agg: Aggregate): string {
  const rows = [...agg.bySeatKey.values()].sort((a, b) => winRate(b) - winRate(a));
  const keys = ['MOVE', 'SPRINT', 'HOLD', 'STRIKE', 'AMBUSH', 'WIRETAP', 'BRIBE', 'DECOY', 'SAFEHOUSE'];
  const lines = [pad('seat', 26) + keys.map((k) => pad(k.slice(0, 6), 8)).join('')];
  lines.push('-'.repeat(26 + keys.length * 8));
  for (const r of rows) {
    const prof = actionProfile(r);
    lines.push(
      pad(r.key, 26) + keys.map((k) => pad(((prof[k] ?? 0) * 100).toFixed(1), 8)).join(''),
    );
  }
  return lines.join('\n');
}

export function toCsv(agg: Aggregate): string {
  const header = 'seat,personality,difficulty,games,winRate,avgScore,avgBurns,avgDossiers,avgIntel,avgAlive,avgDistance,p99ms';
  const rows = [...agg.bySeatKey.values()].map((r) =>
    [
      r.key,
      r.personality,
      r.difficulty,
      r.games,
      winRate(r).toFixed(4),
      (r.score / r.games).toFixed(3),
      (r.burns / r.games).toFixed(3),
      (r.dossiers / r.games).toFixed(3),
      (r.intel / r.games).toFixed(3),
      (r.agentsAlive / r.games).toFixed(3),
      (r.distance / r.games).toFixed(3),
      percentile(r.decisionMs, 99).toFixed(3),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

function pad(s: string, n: number): string {
  return s.length >= n ? `${s.slice(0, n - 1)} ` : s + ' '.repeat(n - s.length);
}
