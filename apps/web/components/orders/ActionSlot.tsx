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
  onClear: () => void;
}

/**
 * One of an agent's two action slots — a readout of what is composed, plus
 * a way to clear it. Choosing an action happens in ActionPicker; this shows
 * the result. Node names rather than ids come from lib/format.ts, the single
 * source of human-readable text.
 */
export function ActionSlot({ index, action, isActive, map, intelCost, onClear }: ActionSlotProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${
        isActive ? 'border-[#2563eb]' : 'border-[#e2e8f0]'
      }`}
    >
      <span className="font-semibold">Slot {index + 1}</span>
      <span className="flex-1 truncate">
        {action ? actionText(map, action) : isActive ? 'Choose an action below' : 'Empty'}
      </span>
      {action && intelCost !== null && intelCost > 0 && (
        <span className="shrink-0 text-xs text-[#475569]">{intelCost} Intel</span>
      )}
      {action && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded border border-[#e2e8f0] px-2 py-1 text-xs"
        >
          Clear
        </button>
      )}
    </div>
  );
}
