import {
  SETTINGS_BOUNDS,
  mapIdForPlayerCount,
  type BlockadeMode,
  type LobbySettings,
} from '@berlin/shared';

/**
 * The host settings panel's view model — option lists and labels, derived
 * from SETTINGS_BOUNDS rather than typed out again here. That is the whole
 * point of the shared bounds table: the control can only ever offer a value
 * the server will accept (LOBBY-14), so the two cannot drift.
 *
 * Pure. No React, no DOM, no network (apps/web/lib/CLAUDE.md).
 */

export interface SettingOption<T> {
  readonly value: T;
  readonly label: string;
}

/** Inclusive range as a list, honouring the bound's own step. */
function rangeOptions(bound: { min: number; max: number; step: number }): number[] {
  const out: number[] = [];
  for (let v = bound.min; v <= bound.max; v += bound.step) out.push(v);
  return out;
}

export function agentOptions(): SettingOption<1 | 2>[] {
  return [
    { value: 1, label: '1 agent' },
    { value: 2, label: '2 agents' },
  ];
}

/**
 * Null — "no clock" — is offered first and deliberately: a table of friends
 * playing together usually wants to talk a round through rather than race a
 * timer, and the option has to exist for `roundTimerSeconds: null` to be
 * reachable at all.
 */
export function timerOptions(): SettingOption<number | null>[] {
  return [
    { value: null, label: 'No clock' },
    ...rangeOptions(SETTINGS_BOUNDS.roundTimerSeconds).map((seconds) => ({
      value: seconds as number | null,
      label: formatTimer(seconds),
    })),
  ];
}

export function formatTimer(seconds: number | null): string {
  if (seconds === null) return 'No clock';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function roundLimitOptions(): SettingOption<number>[] {
  return rangeOptions(SETTINGS_BOUNDS.roundLimit).map((rounds) => ({
    value: rounds,
    label: `${rounds} rounds`,
  }));
}

export function dossierOptions(): SettingOption<number>[] {
  return rangeOptions(SETTINGS_BOUNDS.dossierCount).map((count) => ({
    value: count,
    label: String(count),
  }));
}

const BLOCKADE_LABELS: Record<BlockadeMode, string> = {
  OFF: 'Off — the city never seals',
  ANNOUNCED: 'Announced — one round of warning',
  RANDOM: 'Random — no warning',
  MIXED: 'Mixed — some announced, some not',
};

export function blockadeOptions(): SettingOption<BlockadeMode>[] {
  return SETTINGS_BOUNDS.blockadeMode.map((mode) => ({
    value: mode,
    label: BLOCKADE_LABELS[mode],
  }));
}

/** Human-readable one-liners for the read-only (non-host) rendering. */
export function settingsSummary(settings: LobbySettings, seatCount: number): string[] {
  return [
    `${settings.agentsPerPlayer} agent${settings.agentsPerPlayer === 1 ? '' : 's'} each`,
    formatTimer(settings.roundTimerSeconds),
    `${settings.roundLimit} rounds`,
    `${settings.dossierCount} dossier${settings.dossierCount === 1 ? '' : 's'}`,
    BLOCKADE_LABELS[settings.blockadeMode],
    mapLabel(seatCount),
  ];
}

const MAP_NAMES: Record<string, string> = {
  'duel-12': 'Duel-12 (12 nodes)',
  'ffa-16': 'FFA-16 (16 nodes)',
  'ffa-18': 'FFA-18 (18 nodes)',
};

/**
 * The map this seat count selects (MAP-03) — read-only everywhere, including
 * for the host. The rule lives in @berlin/shared's mapIdForPlayerCount; this
 * only names the result.
 */
export function mapLabel(seatCount: number): string {
  const id = mapIdForPlayerCount(seatCount);
  return MAP_NAMES[id] ?? id;
}
