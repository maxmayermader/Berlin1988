import { describe, expect, it } from 'vitest';
import { projectView, quickSettings } from '@berlin/engine';
import type { Signal, SignalKind } from '@berlin/shared';
import {
  audienceOf,
  groupByRound,
  highlightOf,
  isRedacted,
  mergeSignals,
  roundDigest,
  signalKey,
  signalLabel,
} from './signals.js';
import { playRounds } from './testing/playedMatch.js';

const sig = (over: Partial<Signal>): Signal => ({
  kind: 'CHATTER',
  round: 2,
  nodeId: null,
  sector: null,
  playerId: null,
  text: 'x',
  ...over,
});

const ALL_KINDS: SignalKind[] = [
  'CHATTER',
  'NOT_ALONE',
  'INFORMANT_REPORT',
  'RADIO_INTERCEPT',
  'BORDER_CROSSING',
  'DOSSIER_TAKEN',
  'STRIKE_EXACT',
  'STRIKE_VICINITY',
  'BURN',
  'BLOCKADE_ANNOUNCED',
  'BLOCKADE_ACTIVE',
];

describe('signal classification', () => {
  it('labels and classifies every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(signalLabel(kind).length).toBeGreaterThan(0);
      expect(['public', 'eyes-only']).toContain(audienceOf(kind));
    }
  });

  it('keeps private deductions eyes-only and public reports public (INTEL-05)', () => {
    expect(audienceOf('RADIO_INTERCEPT')).toBe('eyes-only');
    expect(audienceOf('NOT_ALONE')).toBe('eyes-only');
    expect(audienceOf('BORDER_CROSSING')).toBe('public');
    expect(audienceOf('BURN')).toBe('public');
  });

  it('redacts exactly the sector-only strike report (INTEL-04)', () => {
    expect(isRedacted(sig({ kind: 'STRIKE_VICINITY', sector: 'RED' }))).toBe(true);
    expect(isRedacted(sig({ kind: 'STRIKE_EXACT', nodeId: 'n' as never, sector: 'RED' }))).toBe(false);
    // An intercept is vague by design, not withheld — no redaction bar.
    expect(isRedacted(sig({ kind: 'RADIO_INTERCEPT', intercept: { kind: 'IN_SECTOR', sector: 'BLUE' } }))).toBe(false);
  });

  it('highlights only what the signal itself names', () => {
    expect(highlightOf(sig({ nodeId: 'a' as never }))).toEqual({ nodeId: 'a', sector: null });
    expect(highlightOf(sig({ kind: 'STRIKE_VICINITY', sector: 'GOLD' }))).toEqual({ nodeId: null, sector: 'GOLD' });
    expect(
      highlightOf(sig({ kind: 'RADIO_INTERCEPT', intercept: { kind: 'NEAR_NODE', nodeId: 'b' as never, within: 2 } })),
    ).toEqual({ nodeId: 'b', sector: null });
    expect(highlightOf(sig({ kind: 'RADIO_INTERCEPT', intercept: { kind: 'DID_NOT_MOVE' } }))).toBeNull();
  });
});

describe('the signals notebook', () => {
  it('is append-only and de-duplicates a frame delivered twice', () => {
    const a = sig({ text: 'one' });
    const b = sig({ text: 'two' });
    const log = mergeSignals(mergeSignals([], [a]), [a, b]);
    expect(log).toEqual([a, b]);
    expect(mergeSignals(log, [a, b])).toEqual(log);
  });

  it('groups newest round first and keeps the engine order within a round', () => {
    const r2a = sig({ round: 2, text: 'a' });
    const r3 = sig({ round: 3, text: 'c' });
    const r2b = sig({ round: 2, text: 'b' });
    const grouped = groupByRound([r2a, r3, r2b]);
    expect(grouped.map((g) => g.round)).toEqual([3, 2]);
    expect(grouped[1]!.signals).toEqual([r2a, r2b]);
  });

  it('digests counts only, never a signal\'s own text', () => {
    const digest = roundDigest([
      sig({ kind: 'CHATTER', text: 'SECRET-TEXT' }),
      sig({ kind: 'CHATTER', text: 'other' }),
      sig({ kind: 'BURN', text: 'b' }),
    ]);
    expect(digest).toBe('1 agent burned · 2 chatter');
    expect(digest).not.toContain('SECRET-TEXT');
    expect(roundDigest([])).toBe('Nothing on the wire.');
  });

  it('accumulated over a real match, holds only signals that were delivered to that player', () => {
    const states = playRounds('signals-notebook', 10);
    const delivered = new Set<string>();
    let log: Signal[] = [];
    for (const state of states) {
      const view = projectView(state, state.playerOrder[0]!);
      for (const s of view.signals) delivered.add(signalKey(s));
      log = mergeSignals(log, view.signals);
    }
    for (const s of log) expect(delivered.has(signalKey(s))).toBe(true);
    expect(quickSettings().seats.length).toBe(2);
  });
});
