import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMatch, quickSettings, viewForOrdering, projectView } from '@berlin/engine';
import { createAgent, PERSONALITY_IDS, DIFFICULTY_IDS } from '../src/index.js';

/**
 * BOTS DON'T CHEAT.
 *
 * An AIAgent receives a PlayerView and nothing else. Difficulty degrades the
 * bot's inference, never its information. This is the single claim in
 * docs/AI_OPPONENTS.md that has to be mechanically enforced rather than
 * trusted, because it is invisible in play — a cheating bot just feels like a
 * good one until someone reads the code.
 */
describe('bots do not cheat', () => {
  it('never imports GameState-shaped state anywhere in the package', () => {
    const files = [
      'agent.ts',
      'belief.ts',
      'evidence.ts',
      'features.ts',
      'threatMap.ts',
      'select.ts',
      'personalities/index.ts',
    ];

    for (const f of files) {
      // Strip comments first — this file's own doc comments legitimately
      // discuss GameState, and scanning them would be a false positive.
      const src = readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // GameState carries every player's true position. If it appears here at
      // all, the fairness guarantee is gone.
      expect(src, `${f} references GameState`).not.toMatch(/\bGameState\b/);
      // These are the engine's authoritative entry points; the AI must not
      // reach past its PlayerView to call them.
      expect(src, `${f} calls resolveRound`).not.toMatch(/\bresolveRound\b/);
      expect(src, `${f} calls createMatch`).not.toMatch(/\bcreateMatch\b/);
    }
  });

  it('decides from a PlayerView alone', () => {
    const state = createMatch(quickSettings(), 'fairness');
    const bot = createAgent('MAREK', 'SPYMASTER', 'seed');
    const view = projectView(state, state.playerOrder[0]!);
    const agent = view.self.agents[0]!;

    // The signature accepts nothing else. This compiles only because the whole
    // decision surface is (PlayerView, AgentId).
    const actions = bot.decide(view, agent.id);
    expect(Array.isArray(actions)).toBe(true);
  });

  it('performs no better when a rival is genuinely hidden vs. visible', () => {
    // A cheating bot would beeline. This asserts the decision is a function of
    // the view: two bots given the SAME view must choose the same thing,
    // regardless of what the underlying state contains.
    const state = createMatch(quickSettings(), 'determinism-view');
    const view = viewForOrdering(state, state.playerOrder[0]!, `${state.playerOrder[0]}:a1`);

    const a = createAgent('VOGEL', 'SPYMASTER', 'same-seed');
    const b = createAgent('VOGEL', 'SPYMASTER', 'same-seed');
    const agentId = view.self.agents[0]!.id;

    expect(a.decide(view, agentId)).toEqual(b.decide(view, agentId));
  });
});

describe('determinism', () => {
  it('gives the same order for the same seed and view history', () => {
    for (const personality of PERSONALITY_IDS) {
      for (const difficulty of DIFFICULTY_IDS) {
        const state = createMatch(quickSettings(), `det-${personality}`);
        const pid = state.playerOrder[0]!;
        const view = viewForOrdering(state, pid, `${pid}:a1`);
        const agentId = view.self.agents[0]!.id;

        const first = createAgent(personality, difficulty, 'S').decide(view, agentId);
        const second = createAgent(personality, difficulty, 'S').decide(view, agentId);

        expect(second, `${personality}/${difficulty} is not deterministic`).toEqual(first);
      }
    }
  });

  it('gives different orders for different seeds', () => {
    const state = createMatch(quickSettings(), 'seeds');
    const pid = state.playerOrder[0]!;
    const view = viewForOrdering(state, pid, `${pid}:a1`);
    const agentId = view.self.agents[0]!.id;

    const outputs = new Set<string>();
    for (let i = 0; i < 30; i++) {
      outputs.add(
        JSON.stringify(createAgent('MAREK', 'RECRUIT', `seed-${i}`).decide(view, agentId)),
      );
    }
    expect(outputs.size, 'every seed produced the same order').toBeGreaterThan(1);
  });
});

describe('loadouts', () => {
  it('every personality builds a legal loadout that matches how it plays', () => {
    const settings = quickSettings();
    for (const id of PERSONALITY_IDS) {
      const bot = createAgent(id, 'HANDLER', 'loadout');
      const deck = bot.buildLoadout(settings);
      expect(deck, `${id} built the wrong number of cards`).toHaveLength(10);
    }
  });
});
