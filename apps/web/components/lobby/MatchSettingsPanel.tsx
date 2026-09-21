'use client';

import type { BlockadeMode, LobbySettings } from '@berlin/shared';
import {
  agentOptions,
  blockadeOptions,
  dossierOptions,
  mapLabel,
  roundLimitOptions,
  settingsSummary,
  timerOptions,
  type SettingOption,
} from '../../lib/matchSettings.js';

export interface MatchSettingsPanelProps {
  settings: LobbySettings;
  seatCount: number;
  isHost: boolean;
  /** The field named by a SET_SETTINGS_REJECTED frame, if any. */
  errorField: string | null;
  error: string | null;
  onChange: (settings: LobbySettings) => void;
}

/**
 * The host's match settings (LOBBY-08..LOBBY-13).
 *
 * Unlike SeatCountControl, this renders for everyone — LOBBY-13 requires
 * every player to see the current settings live, so a non-host gets the same
 * values as a read-only summary rather than nothing at all. The server's
 * handleSetSettings is the sole authority (apps/party/src/handlers.ts); this
 * component decides nothing beyond mapping props onto markup
 * (apps/web/components/CLAUDE.md).
 *
 * Every option is offered from the shared SETTINGS_BOUNDS table, so a
 * control can never present a value the room would refuse.
 */
export function MatchSettingsPanel({
  settings,
  seatCount,
  isHost,
  errorField,
  error,
  onChange,
}: MatchSettingsPanelProps) {
  if (!isHost) {
    return (
      <section className="flex flex-col gap-2" aria-label="Match settings">
        <h3 className="text-base font-semibold">Match Settings</h3>
        <ul className="flex flex-col gap-1 text-sm text-[#475569]">
          {settingsSummary(settings, seatCount).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-xs text-[#64748b]">Only the host can change these.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Match settings">
      <h3 className="text-base font-semibold">Match Settings</h3>

      <Segmented
        label="Agents each"
        options={agentOptions()}
        current={settings.agentsPerPlayer}
        invalid={errorField === 'agentsPerPlayer'}
        onSelect={(agentsPerPlayer) => onChange({ ...settings, agentsPerPlayer })}
      />

      <Dropdown
        label="Round timer"
        options={timerOptions()}
        current={settings.roundTimerSeconds}
        invalid={errorField === 'roundTimerSeconds'}
        onSelect={(roundTimerSeconds) => onChange({ ...settings, roundTimerSeconds })}
      />

      <Dropdown
        label="Match length"
        options={roundLimitOptions()}
        current={settings.roundLimit}
        invalid={errorField === 'roundLimit'}
        onSelect={(roundLimit) => onChange({ ...settings, roundLimit })}
      />

      <Segmented
        label="Dossiers on the map"
        options={dossierOptions()}
        current={settings.dossierCount}
        invalid={errorField === 'dossierCount'}
        onSelect={(dossierCount) => onChange({ ...settings, dossierCount })}
      />

      <Dropdown<BlockadeMode>
        label="Blockades"
        options={blockadeOptions()}
        current={settings.blockadeMode}
        invalid={errorField === 'blockadeMode'}
        onSelect={(blockadeMode) => onChange({ ...settings, blockadeMode })}
      />

      {/* Not a control: MAP-03 makes the map a function of the seat count. */}
      <div className="flex flex-col gap-1">
        <span className="text-sm text-[#475569]">Map</span>
        <span className="text-sm font-semibold">{mapLabel(seatCount)}</span>
        <span className="text-xs text-[#64748b]">Chosen automatically from the seat count.</span>
      </div>

      <p className="text-xs text-[#64748b]">
        Changing a setting clears everyone&apos;s ready state.
      </p>
      {error !== null && <p className="text-sm text-[#dc2626]">{error}</p>}
    </section>
  );
}

/** Buttons for a short option list. 44px minimum hit target, per the UI spec. */
function Segmented<T extends string | number>({
  label,
  options,
  current,
  invalid,
  onSelect,
}: {
  label: string;
  options: readonly SettingOption<T>[];
  current: T;
  invalid: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-[#475569]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === current;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(option.value)}
              className={`h-11 min-w-11 rounded border px-3 text-sm font-semibold ${
                selected
                  ? 'border-[#2563eb] text-[#2563eb]'
                  : invalid
                    ? 'border-[#dc2626] text-[#0f172a]'
                    : 'border-[#e2e8f0] text-[#0f172a]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A native select for the longer lists. `null` is encoded as the empty
 * string on the wire of the DOM only — the value handed back to onSelect is
 * always the option's own typed value, looked up by index, so no parsing or
 * re-casting happens here.
 */
function Dropdown<T extends string | number | null>({
  label,
  options,
  current,
  invalid,
  onSelect,
}: {
  label: string;
  options: readonly SettingOption<T>[];
  current: T;
  invalid: boolean;
  onSelect: (value: T) => void;
}) {
  const selectedIndex = options.findIndex((option) => option.value === current);
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-[#475569]">{label}</span>
      <select
        value={selectedIndex === -1 ? 0 : selectedIndex}
        onChange={(event) => {
          const option = options[Number(event.target.value)];
          if (option) onSelect(option.value);
        }}
        className={`h-11 rounded border px-3 text-sm ${
          invalid ? 'border-[#dc2626]' : 'border-[#e2e8f0]'
        }`}
      >
        {options.map((option, index) => (
          <option key={String(option.value)} value={index}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
