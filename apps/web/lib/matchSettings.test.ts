import { DEFAULT_LOBBY_SETTINGS, SETTINGS_BOUNDS, invalidSettingsField } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import {
  agentOptions,
  blockadeOptions,
  dossierOptions,
  formatTimer,
  mapLabel,
  roundLimitOptions,
  settingsSummary,
  timerOptions,
} from './matchSettings.js';

describe('apps/web/lib/matchSettings (pure view model)', () => {
  it('every offered option is a value the server would accept', () => {
    // The point of the shared bounds table: a control can never present a
    // value handleSetSettings would refuse (LOBBY-14). Building each option
    // into a full settings object and running the server's own predicate is
    // the only check that actually proves that.
    for (const option of agentOptions()) {
      expect(
        invalidSettingsField({ ...DEFAULT_LOBBY_SETTINGS, agentsPerPlayer: option.value }),
      ).toBeNull();
    }
    for (const option of timerOptions()) {
      expect(
        invalidSettingsField({ ...DEFAULT_LOBBY_SETTINGS, roundTimerSeconds: option.value }),
      ).toBeNull();
    }
    for (const option of roundLimitOptions()) {
      expect(
        invalidSettingsField({ ...DEFAULT_LOBBY_SETTINGS, roundLimit: option.value }),
      ).toBeNull();
    }
    for (const option of dossierOptions()) {
      expect(
        invalidSettingsField({ ...DEFAULT_LOBBY_SETTINGS, dossierCount: option.value }),
      ).toBeNull();
    }
    for (const option of blockadeOptions()) {
      expect(
        invalidSettingsField({ ...DEFAULT_LOBBY_SETTINGS, blockadeMode: option.value }),
      ).toBeNull();
    }
  });

  it('offers every blockade mode the ruleset defines', () => {
    expect(blockadeOptions().map((o) => o.value)).toEqual([...SETTINGS_BOUNDS.blockadeMode]);
  });

  it('offers "no clock" as a reachable timer option', () => {
    expect(timerOptions()[0]).toEqual({ value: null, label: 'No clock' });
  });

  it('spans the full timer range at the declared step', () => {
    const values = timerOptions()
      .map((o) => o.value)
      .filter((v): v is number => v !== null);
    expect(values[0]).toBe(SETTINGS_BOUNDS.roundTimerSeconds.min);
    expect(values.at(-1)).toBe(SETTINGS_BOUNDS.roundTimerSeconds.max);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]! - values[i - 1]!).toBe(SETTINGS_BOUNDS.roundTimerSeconds.step);
    }
  });

  it('labels every option distinctly, so no two are indistinguishable in a list', () => {
    for (const options of [
      agentOptions(),
      timerOptions(),
      roundLimitOptions(),
      dossierOptions(),
      blockadeOptions(),
    ]) {
      const labels = options.map((o) => o.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  describe('formatTimer', () => {
    it('renders seconds, whole minutes and mixed values', () => {
      expect(formatTimer(null)).toBe('No clock');
      expect(formatTimer(45)).toBe('45s');
      expect(formatTimer(60)).toBe('1m');
      expect(formatTimer(90)).toBe('1m 30s');
      expect(formatTimer(180)).toBe('3m');
    });
  });

  describe('mapLabel (MAP-03)', () => {
    it('names the map each seat count actually selects', () => {
      expect(mapLabel(1)).toContain('Duel-12');
      expect(mapLabel(2)).toContain('Duel-12');
      expect(mapLabel(3)).toContain('FFA-16');
      expect(mapLabel(4)).toContain('FFA-18');
    });

    it('never falls through to a raw map id', () => {
      for (let count = 1; count <= 4; count++) expect(mapLabel(count)).toMatch(/\(\d+ nodes\)/);
    });
  });

  describe('settingsSummary (the non-host read-only view, LOBBY-13)', () => {
    it('reports every host-settable field plus the derived map', () => {
      const lines = settingsSummary(DEFAULT_LOBBY_SETTINGS, 4);
      expect(lines).toHaveLength(6);
      expect(lines.join(' | ')).toContain('2 agents each');
      expect(lines.join(' | ')).toContain('14 rounds');
      expect(lines.join(' | ')).toContain('FFA-18');
    });

    it('singularises a one-agent, one-dossier match', () => {
      const lines = settingsSummary(
        { ...DEFAULT_LOBBY_SETTINGS, agentsPerPlayer: 1, dossierCount: 1 },
        2,
      );
      expect(lines).toContain('1 agent each');
      expect(lines).toContain('1 dossier');
    });
  });
});
