'use client';

import { tryGetCard } from '@berlin/engine';
import type { Card, CardId, Loadout, Sector } from '@berlin/shared';
import { CardGrid } from './CardGrid.js';
import { LegalityMeter } from './LegalityMeter.js';
import type { LoadoutSaveStatus } from '../../lib/loadoutStore.js';
import { loadoutLegality } from '../../lib/loadoutStore.js';
import { PresetPicker } from './PresetPicker.js';
import { Button } from '../ui/Button.js';

/** 02-UI-SPEC.md's fixed four-color palette — a sector swatch is always
 *  paired with its uppercase text label, never color alone
 *  (apps/web/components/CLAUDE.md). */
const SECTOR_SWATCH: Record<Sector, string> = {
  RED: '#dc2626',
  BLUE: '#2563eb',
  GOLD: '#ca8a04',
  GREEN: '#16a34a',
};

export interface DeckbuilderProps {
  loadout: readonly CardId[];
  cards: readonly Card[];
  onAdd: (id: CardId) => void;
  onRemove: (id: CardId) => void;
  onLoadPreset: (preset: Loadout) => void;
  /** Optional — the home-page `/deck` route passes none of these four and
   *  the component renders exactly as it always has. Only the in-lobby
   *  embed (Plan 02-04) supplies them, and only persistence plumbing
   *  differs between the two host contexts — no branch here may test which
   *  page it's on. */
  saveStatus?: LoadoutSaveStatus;
  /** Sends the draft to the room and (on acceptance) returns to the lobby
   *  view. Absent on the home page, where there is no room to send to. */
  onSave?: () => void;
  /** The always-enabled second exit — closes the embed without sending.
   *  D-01's autosave already persisted the draft locally, so backing out
   *  loses nothing; the room simply keeps its last accepted deck. */
  onClose?: () => void;
  /** D-05: true for the whole time the in-lobby embed is open, regardless
   *  of whether the seat was ready when it opened — 02-UI-SPEC.md requires
   *  the notice on every open, never conditionally hidden. */
  showReadyClearedBanner?: boolean;
}

/**
 * The presentational deckbuilder shell (props in, callbacks out) — no
 * localStorage or socket access of its own (apps/web/components/CLAUDE.md:
 * "Nothing here fetches"). Two columns mirroring the existing Board+Orders
 * split (apps/web/app/match/[code]/page.tsx): CardGrid scrolls as the
 * primary area, a sticky right-hand column holds the preset picker, the
 * legality meter, and the deck summary/autosave line. Legality is
 * recomputed from `loadout` on every render — never cached — so the numbers
 * can never lag behind an edit.
 */
export function Deckbuilder({
  loadout,
  cards,
  onAdd,
  onRemove,
  onLoadPreset,
  saveStatus,
  onSave,
  onClose,
  showReadyClearedBanner,
}: DeckbuilderProps) {
  const legality = loadoutLegality(loadout);

  return (
    <div className="flex flex-col gap-8 md:flex-row md:items-start">
      <div className="flex flex-col gap-4 md:w-3/5">
        {showReadyClearedBanner && (
          <p className="rounded border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-2 text-sm text-[#64748b]">
            Editing your loadout — your ready status has been cleared. Ready up again when you&apos;re done.
          </p>
        )}
        <CardGrid
          cards={cards}
          loadout={loadout}
          violatingCardIds={legality.violatingCardIds}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </div>

      <div className="flex flex-col gap-6 md:sticky md:top-8 md:w-2/5">
        <PresetPicker onLoadPreset={onLoadPreset} />

        {saveStatus?.state === 'storage-failed' && (
          <p className="rounded border border-[#dc2626] bg-[#f1f5f9] px-4 py-2 text-sm text-[#dc2626]">
            {"Couldn't save changes in this browser. Your edits won't persist after you leave this page."}
          </p>
        )}

        <div data-testid="your-loadout" className="flex flex-col gap-2">
          <h2 className="text-[20px] font-semibold leading-[1.2]">Your loadout</h2>
          {loadout.map((id, index) => {
            // A tampered localStorage draft can hold an id no card resolves
            // to (threat model: "localStorage draft -> grid render") — this
            // summary reports that rather than throwing.
            const card = tryGetCard(id);
            return (
              <div
                key={`${id}-${index}`}
                data-card-id={id}
                className="flex items-center gap-2 rounded border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-2"
              >
                {card ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: SECTOR_SWATCH[card.sector] }}
                    />
                    <span className="text-sm font-semibold uppercase">{card.sector}</span>
                    <span className="text-base">{card.name}</span>
                  </>
                ) : (
                  <span className="text-sm text-[#dc2626]">Unknown card: {id}</span>
                )}
              </div>
            );
          })}
        </div>

        <LegalityMeter legality={legality} />

        <p className="text-sm text-[#64748b]">Changes save automatically</p>

        {onSave && onClose && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                onClick={onSave}
                pending={saveStatus?.state === 'pending'}
                disabled={!legality.isLegal || saveStatus?.state === 'pending'}
              >
                Save Loadout
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Back to Lobby
              </Button>
            </div>
            {saveStatus?.state === 'rejected' && saveStatus.message && (
              <p className="text-sm text-[#dc2626]">
                {`Couldn't save your loadout — ${saveStatus.message}. Try again.`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
