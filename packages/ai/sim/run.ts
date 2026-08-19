import { writeFileSync } from 'node:fs';
import type { Difficulty, PersonalityId } from '@berlin/shared';
import { RULESETS } from '@berlin/engine';
import { runMatch, type SeatSpec } from './match.js';
import { aggregate, formatProfiles, formatTable, toCsv } from './report.js';
import { PERSONALITY_IDS } from '../src/index.js';

/**
 * CLI entry for the balance harness.
 *
 *   pnpm sim --matches 2000 --agents 2
 *   pnpm sim --matches 2000 --ruleset hot --csv out.csv
 *   pnpm sim --matches 1000 --players 4
 *
 * Fully deterministic: every run takes a master seed and is reproducible, so a
 * surprising result can always be re-run with one command.
 */

interface Args {
  matches: number;
  agents: 1 | 2;
  players: number;
  ruleset: string;
  difficulty: Difficulty;
  seed: string;
  dossiers: number | null;
  csv: string | null;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback: string): string => {
    const i = argv.indexOf(`--${flag}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
  };
  return {
    matches: Number(get('matches', '500')),
    agents: Number(get('agents', '2')) === 1 ? 1 : 2,
    players: Number(get('players', '2')),
    ruleset: get('ruleset', 'default'),
    difficulty: get('difficulty', 'HANDLER') as Difficulty,
    seed: get('seed', 'sweep'),
    dossiers: argv.includes('--dossiers') ? Number(get('dossiers', '3')) : null,
    csv: argv.includes('--csv') ? get('csv', 'sim.csv') : null,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!RULESETS[args.ruleset]) {
    console.error(`Unknown ruleset: ${args.ruleset}. Known: ${Object.keys(RULESETS).join(', ')}`);
    process.exit(1);
  }

  console.log(
    `Berlin 1988 — sim\n` +
      `ruleset=${args.ruleset} players=${args.players} agents=${args.agents} ` +
      `difficulty=${args.difficulty} matches=${args.matches} seed=${args.seed}\n`,
  );

  const results = [];
  const t0 = performance.now();

  for (let i = 0; i < args.matches; i++) {
    // Rotate personalities through seats so no personality gets a fixed
    // faction or seat-order advantage.
    const seats: SeatSpec[] = [];
    for (let s = 0; s < args.players; s++) {
      const p = PERSONALITY_IDS[(i + s) % PERSONALITY_IDS.length] as PersonalityId;
      seats.push({ personality: p, difficulty: args.difficulty });
    }
    results.push(
      runMatch(`${args.seed}-${i}`, seats, {
        agentsPerPlayer: args.agents,
        rulesetId: args.ruleset,
        ...(args.dossiers !== null ? { dossierCount: args.dossiers } : {}),
      }),
    );
  }

  const elapsed = performance.now() - t0;
  const agg = aggregate(results);

  console.log(formatTable(agg));
  if (process.argv.includes('--profile')) {
    console.log(`\naction mix (% of all actions)\n`);
    console.log(formatProfiles(agg));
  }
  console.log(`\n${(elapsed / 1000).toFixed(1)}s · ${(elapsed / args.matches).toFixed(1)}ms/match`);

  if (args.csv) {
    writeFileSync(args.csv, `${toCsv(agg)}\n`);
    console.log(`wrote ${args.csv}`);
  }
}

main();
