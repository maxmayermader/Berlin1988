'use client';

import type { Action } from '@berlin/shared';

export interface ActionSlotProps {
  /** 0 or 1. */
  index: number;
  action: Action | null;
  /** This is the slot the next click/Hold will fill. */
  isActive: boolean;
  canHold: boolean;
  onHold: () => void;
  onClear: () => void;
}

function describeAction(action: Action): string {
  switch (action.type) {
    case 'HOLD':
      return 'Hold';
    case 'MOVE':
      return `Move → ${action.to}`;
    case 'SPRINT':
      return `Sprint via ${action.via} → ${action.to}`;
    case 'WIRETAP':
      return `Wiretap ${action.target}`;
    case 'BRIBE':
      return 'Bribe';
    case 'DECOY':
      return `Decoy → ${action.target}`;
    case 'SAFEHOUSE':
      return 'Place safehouse';
    case 'STRIKE':
      return `Strike ${action.target}`;
    case 'AMBUSH':
      return 'Set ambush';
    default:
      return 'Unknown';
  }
}

/** One of an agent's two action slots. Tracer scope offers only a Hold
 *  button here — MOVE is filled by clicking the board, per Task 1's action
 *  text. Later slots' card-driven actions render via the same describeAction
 *  mapping once composed, whichever slot they land in. */
export function ActionSlot({ index, action, isActive, canHold, onHold, onClear }: ActionSlotProps) {
  return (
    <div
      className={
        isActive
          ? 'flex items-center justify-between gap-2 rounded border border-[#2563eb] px-3 py-2 text-sm'
          : 'flex items-center justify-between gap-2 rounded border border-[#e2e8f0] px-3 py-2 text-sm'
      }
    >
      <span className="font-semibold">Slot {index + 1}</span>
      <span className="flex-1 truncate">
        {action ? describeAction(action) : isActive ? 'Choose a target on the board' : 'Empty'}
      </span>
      {!action && isActive && canHold && (
        <button
          type="button"
          onClick={onHold}
          className="rounded border border-[#e2e8f0] px-2 py-1 text-xs font-semibold"
        >
          Hold
        </button>
      )}
      {action && (
        <button type="button" onClick={onClear} className="rounded border border-[#e2e8f0] px-2 py-1 text-xs">
          Clear
        </button>
      )}
    </div>
  );
}
