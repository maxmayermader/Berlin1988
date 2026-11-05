'use client';

import { tryGetCard } from '@berlin/engine';
import type { Card, CardId, Loadout, Sector } from '@berlin/shared';
import { CardGrid } from './CardGrid.js';
import { LegalityMeter } from './LegalityMeter.js';
import type { LoadoutSaveStatus } from '../../lib/loadoutStore.js';
import { loadoutLegality } from '../../lib/loadoutStore.js';
import { PresetPicker } from './PresetPicker.js';
import { SECTOR_COLOR } from '../../lib/sectors.js';
import { SectorGlyph } from '../intel/SectorGlyph.js';
import { Button } from '../ui/Button.js';

/** The theme's sector inks (lib/sectors.ts) — a sector swatch is always
 *  paired with its shape and uppercase text label, never color alone
 *  (apps/web/components/CLAUDE.md). */
const SECTOR_SWATCH: Record<Sector, string> = SECTOR_COLOR;

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
          <p className="rounded-[2px] border-l-4 border-warn bg-paper px-4 py-2 text-sm">
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
          <p className="rounded-[2px] border-l-4 border-stamp bg-paper px-4 py-2 text-sm text-stamp">
            {"Couldn't save changes in this browser. Your edits won't persist after you leave this page."}
          </p>
        )}

        <div data-testid="your-loadout" className="paper flex flex-col gap-1 rounded-[3px] p-4 shadow-sheet">
          <h2 className="font-display text-xl leading-none">Your loadout</h2>
          {loadout.map((id, index) => {
            // A tampered localStorage draft can hold an id no card resolves
            // to (threat model: "localStorage draft -> grid render") — this
            // summary reports that rather than throwing.
            const card = tryGetCard(id);
            return (
              <div
                key={`${id}-${index}`}
                data-card-id={id}
                className="flex items-center gap-2 border-b border-dashed border-rule py-1.5 last:border-b-0"
                style={card ? { boxShadow: `inset 3px 0 0 0 ${SECTOR_SWATCH[card.sector]}` } : undefined}
              >
                {card ? (
                  <>
                    <span className="w-6 pl-2 text-right text-xs font-bold tabular-nums text-ink-muted">{index + 1}.</span>
                    <SectorGlyph sector={card.sector} size={12} />
                    <span className="label-caps w-12 shrink-0 text-[0.62rem]">{card.sector}</span>
                    <span className="min-w-0 flex-1 truncate font-bold">{card.name}</span>
                    <span className="label-caps shrink-0 text-[0.58rem] text-ink-muted">{card.icon}</span>
                  </>
                ) : (
                  <span className="text-sm text-stamp">Unknown card: {id}</span>
                )}
              </div>
            );
          })}
        </div>

        <LegalityMeter legality={legality} />

        <p className="label-caps text-ink-muted">Changes save automatically</p>

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
              <p className="text-sm text-stamp">
                {`Couldn't save your loadout — ${saveStatus.message}. Try again.`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
