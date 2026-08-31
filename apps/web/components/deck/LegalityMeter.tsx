'use client';

import { DEFAULT_RULESET } from '@berlin/engine';
import { ICONS, SECTORS } from '@berlin/shared';
import type { LoadoutLegality } from '../../lib/loadoutStore.js';

export interface LegalityMeterProps {
  legality: LoadoutLegality;
}

const LOADOUT_SIZE = DEFAULT_RULESET.loadoutSize;
const BUDGET_LIMIT = DEFAULT_RULESET.maxBudgetPoints;
const PER_ICON_LIMIT = DEFAULT_RULESET.maxPerIcon;

/**
 * The persistent live readout (DECK-02). Everything here is a number or a
 * message the caller already computed via loadoutLegality() — this
 * component renders an answer, it never derives one. `violation.message` is
 * rendered verbatim; re-deriving copy from `violation.code` would fork the
 * wording from the engine's own text (02-RESEARCH.md Pitfall 2).
 *
 * The three constants above are read from DEFAULT_RULESET and used solely
 * to color the BP bar and label the icon pips — they decide no legality
 * outcome; `legality.isLegal` and `legality.violations` (the engine's own
 * answer) are what the panel actually reports.
 */
export function LegalityMeter({ legality }: LegalityMeterProps) {
  const { violations, budgetPoints, cardCount, iconCounts, colorsPresent, isLegal } = legality;
  const overBudget = budgetPoints > BUDGET_LIMIT;

  return (
    <div className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto rounded border border-[#e2e8f0] bg-[#f1f5f9] p-6">
      <p className="text-[20px] font-semibold leading-[1.2]">
        {cardCount}/{LOADOUT_SIZE} cards
      </p>

      <div className="flex flex-col gap-1">
        <div className="h-2 w-full overflow-hidden rounded bg-[#e2e8f0]">
          <div
            className={`h-full ${overBudget ? 'bg-[#dc2626]' : 'bg-[#2563eb]'}`}
            style={{ width: `${Math.min(100, (budgetPoints / BUDGET_LIMIT) * 100)}%` }}
          />
        </div>
        <p className={`text-sm font-semibold ${overBudget ? 'text-[#dc2626]' : ''}`}>
          {budgetPoints}/{BUDGET_LIMIT} BP
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ICONS.map((icon) => {
          const count = iconCounts[icon];
          const overLimit = count > PER_ICON_LIMIT;
          return (
            <span
              key={icon}
              className={`rounded px-2 py-1 text-sm font-semibold uppercase ${
                overLimit ? 'bg-[#dc2626] text-white' : 'bg-white text-[#0f172a]'
              }`}
            >
              {icon} {count}/{PER_ICON_LIMIT}
            </span>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        {SECTORS.map((sector) => {
          const present = colorsPresent[sector];
          return (
            <div
              key={sector}
              className={`flex items-center gap-2 text-sm font-semibold ${present ? '' : 'text-[#dc2626]'}`}
            >
              <span aria-hidden="true">{present ? '✓' : '✗'}</span>
              <span className="uppercase">{sector}</span>
            </div>
          );
        })}
      </div>

      {isLegal ? (
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-[#2563eb]">Loadout legal</p>
          <p className="text-sm">10 cards, ≤3 per icon, 2+ colors, ≤26 BP. Ready to save.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {violations.map((violation) => (
            <li
              key={violation.code}
              className="rounded border-l-4 border-l-[#dc2626] bg-white px-3 py-2 text-sm text-[#0f172a]"
            >
              {violation.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
