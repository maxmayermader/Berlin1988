'use client';

import { HUNTER, OLIGARCH, PHANTOM, SPIDER } from '@berlin/engine';
import type { Loadout } from '@berlin/shared';
import { Button } from '../ui/Button.js';

export interface PresetPickerProps {
  onLoadPreset: (preset: Loadout) => void;
}

interface PresetOption {
  readonly name: string;
  readonly loadout: Loadout;
}

/** Card lists come from @berlin/engine's own reviewed exports — never
 *  re-typed here (02-RESEARCH.md "Don't Hand-Roll"). */
const PRESETS: readonly PresetOption[] = [
  { name: 'Phantom', loadout: PHANTOM },
  { name: 'Hunter', loadout: HUNTER },
  { name: 'Oligarch', loadout: OLIGARCH },
  { name: 'Spider', loadout: SPIDER },
];

/**
 * The four starter-preset buttons (DECK-03). Every click is guarded by a
 * native window.confirm() (D-02) — unconditionally, even on the untouched
 * first-run seed, because this component has no way to know whether the
 * current ten cards were deliberately chosen or merely inherited, and
 * guessing wrong is the silent-discard failure the phase's prohibitions
 * exist to prevent.
 */
export function PresetPicker({ onLoadPreset }: PresetPickerProps) {
  function handleClick(preset: PresetOption) {
    const confirmed = window.confirm(`Load ${preset.name}? This replaces your current loadout.`);
    if (!confirmed) return;
    onLoadPreset(preset.loadout);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <Button key={preset.name} variant="ghost" onClick={() => handleClick(preset)}>
          Load {preset.name}
        </Button>
      ))}
    </div>
  );
}
