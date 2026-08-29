'use client';

import { getCard } from '@berlin/engine';
import type { CardId, Loadout, Sector } from '@berlin/shared';
import type { LoadoutSaveStatus } from '../../lib/loadoutStore.js';
import { PresetPicker } from './PresetPicker.js';

export interface DeckbuilderProps {
  loadout: readonly CardId[];
  onLoadPreset: (preset: Loadout) => void;
  /** Optional — omitted callers (none currently) simply never show the
   *  storage-failure banner below. */
  saveStatus?: LoadoutSaveStatus;
}

/** 02-UI-SPEC.md's fixed four-color palette — a sector swatch is always
 *  paired with its uppercase text label, never color alone
 *  (apps/web/components/CLAUDE.md). */
const SECTOR_SWATCH: Record<Sector, string> = {
  RED: '#dc2626',
  BLUE: '#2563eb',
  GOLD: '#ca8a04',
  GREEN: '#16a34a',
};

/**
 * The presentational deckbuilder shell (props in, callbacks out) — no
 * localStorage or socket access of its own (apps/web/components/CLAUDE.md:
 * "Nothing here fetches"). Renders the four preset buttons and the current
 * ten-card loadout; card grid, live legality meter, and add/remove are
 * Plans 02-02/02-03/02-04.
 */
export function Deckbuilder({ loadout, onLoadPreset, saveStatus }: DeckbuilderProps) {
  return (
    <div className="flex flex-col gap-6">
      <PresetPicker onLoadPreset={onLoadPreset} />

      {saveStatus?.state === 'storage-failed' && (
        <p className="rounded border border-[#dc2626] bg-[#f1f5f9] px-4 py-2 text-sm text-[#dc2626]">
          {"Couldn't save changes in this browser. Your edits won't persist after you leave this page."}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold leading-[1.2]">Your loadout</h2>
        {loadout.map((id, index) => {
          const card = getCard(id);
          return (
            <div
              key={`${id}-${index}`}
              data-card-id={id}
              className="flex items-center gap-2 rounded border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-2"
            >
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: SECTOR_SWATCH[card.sector] }}
              />
              <span className="text-sm font-semibold uppercase">{card.sector}</span>
              <span className="text-base">{card.name}</span>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-[#64748b]">Changes save automatically</p>
    </div>
  );
}
