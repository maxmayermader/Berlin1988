import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { quickSettings } from '../src/index.js';
import { fingerprint, playRandomMatch } from './helpers.js';

/**
 * Golden replay fixtures — the regression net.
 *
 * A recorded match must replay to a byte-identical final state across code
 * changes, not just within one process. determinism.test.ts proves the engine
 * is deterministic; this proves it still does the SAME thing it did yesterday.
 *
 * Fixtures run against the FROZEN ruleset, so tuning `default` during balance
 * work does not churn them. If a change here is intentional, regenerate with:
 *
 *   UPDATE_GOLDEN=1 pnpm test golden
 *
 * and read the diff before committing it. Every bug fixed in the resolution
 * pipeline should arrive with a new fixture.
 */

const DIR = fileURLToPath(new URL('./golden/', import.meta.url));
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const CASES = [
  { name: 'duel-2-agents', seed: 'golden-duel', agentsPerPlayer: 2 as const },
  { name: 'duel-1-agent', seed: 'golden-solo', agentsPerPlayer: 1 as const },
  { name: 'blockades-off', seed: 'golden-noblock', agentsPerPlayer: 2 as const, blockadeMode: 'OFF' as const },
];

describe('golden replays', () => {
  for (const c of CASES) {
    it(`${c.name} matches its recorded fixture`, () => {
      const settings = quickSettings({
        agentsPerPlayer: c.agentsPerPlayer,
        rulesetId: 'frozen-v1',
        // Pinned explicitly: fixtures must not move when a host-setting
        // DEFAULT is retuned, only when the RULES change.
        dossierCount: 3,
        ...(c.blockadeMode ? { blockadeMode: c.blockadeMode } : {}),
      });

      const { final } = playRandomMatch(c.seed, settings);
      const actual = fingerprint(final);
      const path = `${DIR}${c.name}.json`;

      if (UPDATE || !existsSync(path)) {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(path, `${JSON.stringify(JSON.parse(actual), null, 2)}\n`);
        if (!UPDATE) {
          console.log(`  recorded new golden fixture: ${c.name}`);
        }
        return;
      }

      const expected = JSON.stringify(JSON.parse(readFileSync(path, 'utf8')));
      expect(actual, `${c.name} diverged from its fixture`).toBe(expected);
    });
  }
});
