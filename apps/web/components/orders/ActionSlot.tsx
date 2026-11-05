'use client';

import type { Action, MapDefinition } from '@berlin/shared';
import { actionText } from '../../lib/format.js';

export interface ActionSlotProps {
  /** 0 or 1. */
  index: number;
  action: Action | null;
  /** This is the slot the picker is currently filling. */
  isActive: boolean;
  map: MapDefinition;
  /** Intel this action will cost, shown once composed (ORDER-03). */
  intelCost: number | null;
  /** False once the order is locked — a locked slot can't be cleared. */
  editable?: boolean;
  onClear: () => void;
}

/**
 * One of an agent's two action slots — a typed line on the order form,
 * plus a way to clear it. Choosing an action happens in ActionPicker; this
 * shows the result. Node names rather than ids come from lib/format.ts, the
 * single source of human-readable text.
 */
export function ActionSlot({ index, action, isActive, map, intelCost, editable = true, onClear }: ActionSlotProps) {
  return (
    <div
      className={`flex min-h-11 items-center gap-2 border-b-2 px-1 py-1.5 text-sm ${
        isActive ? 'border-accent bg-accent/5' : action ? 'border-ink/60' : 'border-dashed border-rule'
      }`}
    >
      <span className="label-caps w-14 shrink-0 text-ink-muted">Slot {index + 1}</span>
      <span className={`flex-1 truncate ${action ? 'font-bold' : 'italic text-ink-muted'}`}>
        {action ? actionText(map, action) : isActive ? 'Choose an action below' : 'Empty'}
      </span>
      {action && intelCost !== null && intelCost > 0 && (
        <span className="shrink-0 text-xs font-bold tabular-nums text-warn">−{intelCost} Intel</span>
      )}
      {action && editable && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear slot ${index + 1}`}
          className="label-caps min-h-8 shrink-0 rounded-[2px] border border-ink/30 px-2 text-[0.6rem] hover:bg-ink/10"
        >
          Clear
        </button>
      )}
    </div>
  );
}
