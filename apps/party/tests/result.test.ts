import { createMatch, projectView, quickSettings } from '@berlin/engine';
import type { GameState, MatchOutcome, ServerMessage } from '@berlin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRoom, playMatch } from './helpers.js';

/**
 * Phase gate, room half. The three-sentence copy contract itself (the exact
 * strings, tie rendering, truncation) is proven once in
 * apps/web/lib/result.test.ts — this file proves the data that feeds it:
 * the engine's own MatchOutcome reaches every connection's projected view
 * unchanged, for all three OutcomeReason values including a tie, and the
 * room stops scheduling alarms once the match has ended (01-RESEARCH.md
 * Axis 3/ROADMAP.md's hibernation flag — the deployed half of that claim is
 * this plan's blocking checkpoint; this is the automatable half).
 */

function last<T extends ServerMessage['type']>(
  messages: readonly ServerMessage[],
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === type) return message as Extract<ServerMessage, { type: T }>;
  }
  return undefined;
}

const SETTINGS = quickSettings();
const P1 = SETTINGS.seats[0]!.id;
const P2 = SETTINGS.seats[1]!.id;

function stateWithOutcome(outcome: MatchOutcome): GameState {
  return { ...createMatch(SETTINGS, 'party-result-unit-seed'), outcome };
}

describe('the engine outcome reaches every projected view unchanged', () => {
  it.each([
    ['EXTRACTION', { reason: 'EXTRACTION', winners: [P1] } as MatchOutcome],
    ['ELIMINATION', { reason: 'ELIMINATION', winners: [P1] } as MatchOutcome],
    ['ROUND_LIMIT', { reason: 'ROUND_LIMIT', winners: [P1] } as MatchOutcome],
  ])('%s — covered deterministically, without needing a seed that happens to produce it', (_label, outcome) => {
    const state = stateWithOutcome(outcome);
    const view = projectView(state, P1);
    expect(view.outcome).toEqual(outcome);
  });

  it('a round-limit tie carries every tied winner to every viewer, not just one', () => {
    const outcome: MatchOutcome = { reason: 'ROUND_LIMIT', winners: [P1, P2] };
    const state = stateWithOutcome(outcome);
    expect(projectView(state, P1).outcome?.winners).toEqual([P1, P2]);
    expect(projectView(state, P2).outcome?.winners).toEqual([P1, P2]);
  });
});

describe('a played match ends the room, not just the engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaches RoomState.phase ENDED, every connection\'s last view carries a non-null outcome, and no alarm remains scheduled', async () => {
    const room = createTestRoom('result-integration');
    // roundLimit is locked to 14 (apps/party/src/settings.ts buildMatchConfig)
    // — 15 rounds of auto-Hold-or-bot-decided play guarantees ROUND_LIMIT
    // fires if nothing ends the match earlier via extraction or elimination.
    const played = await playMatch(room, 15);

    const state = room.roomState();
    expect(state?.phase).toBe('ENDED');
    expect(state?.gameState?.outcome).not.toBeNull();

    const lastResolved = last(played.host.received, 'ROUND_RESOLVED');
    expect(lastResolved).toBeDefined();
    expect(lastResolved!.view.outcome).not.toBeNull();

    expect(await room.alarmScheduled()).toBe(false);
  });
});
