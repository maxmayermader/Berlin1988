'use client';

import { isPassive } from '@berlin/engine';
import { ICONS, type Card, type CardId, type Sector } from '@berlin/shared';
import { Button } from '../ui/Button.js';

export interface CardGridProps {
  cards: readonly Card[];
  loadout: readonly CardId[];
  /** Tiles breaking an ICON_LIMIT or UNKNOWN_CARD violation the engine
   *  already reported (loadoutLegality's attribution) — everything else
   *  renders with no highlight regardless of what else is wrong. */
  violatingCardIds?: readonly CardId[];
  onAdd: (id: CardId) => void;
  onRemove: (id: CardId) => void;
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

interface CardTileProps {
  card: Card;
  inLoadout: boolean;
  violating: boolean;
  onAdd: (id: CardId) => void;
  onRemove: (id: CardId) => void;
}

/** One tile: name, sector swatch + its text label, icon name, BP cost, the
 *  card's own text (never truncated), a Consumable/Permanent tag for
 *  passives, and a single Add/Remove toggle — never a stepper, since
 *  validateLoadout() has no duplicate-id rule at all. */
function CardTile({ card, inLoadout, violating, onAdd, onRemove }: CardTileProps) {
  return (
    <div
      data-card-id={card.id}
      className={`flex flex-col gap-2 rounded border bg-[#f1f5f9] p-4 ${
        violating ? 'border-l-4 border-l-[#dc2626] border-y-[#e2e8f0] border-r-[#e2e8f0]' : 'border-[#e2e8f0]'
      }`}
    >
      <div className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: SECTOR_SWATCH[card.sector] }}
        />
        <span className="text-sm font-semibold uppercase">{card.sector}</span>
        <span className="text-sm font-semibold uppercase text-[#64748b]">{card.icon}</span>
      </div>
      <p className="text-base font-semibold">{card.name}</p>
      <p className="text-sm text-[#64748b]">{card.budgetPoints} BP</p>
      <p className="text-base">{card.text}</p>
      {isPassive(card) && (
        <span className="text-sm font-semibold uppercase text-[#64748b]">
          {card.consumable ? 'Consumable' : 'Permanent'}
        </span>
      )}
      {violating && <p className="text-sm text-[#dc2626]">Over the icon limit</p>}
      <Button
        variant={inLoadout ? 'destructive' : 'primary'}
        onClick={() => (inLoadout ? onRemove(card.id) : onAdd(card.id))}
      >
        {inLoadout ? 'Remove' : 'Add'}
      </Button>
    </div>
  );
}

/**
 * The full 34-card pool (D-04): one section per canonical ICONS entry
 * holding that icon's active cards, then a final Passives section holding
 * every passive. Sections are derived by filtering the `cards` prop, never
 * a hand-written list, so a card added to the engine shows up here with no
 * edit. Every ICONS entry renders its own section even if it happened to
 * hold zero active cards — a section never vanishes.
 */
export function CardGrid({ cards, loadout, violatingCardIds = [], onAdd, onRemove }: CardGridProps) {
  const violatingSet = new Set(violatingCardIds);
  const passives = cards.filter(isPassive);

  return (
    <div className="flex flex-col gap-8">
      {ICONS.map((icon) => {
        const iconCards = cards.filter((c) => c.icon === icon && !isPassive(c));
        return (
          <section key={icon} className="flex flex-col gap-2 rounded border border-[#e2e8f0] bg-white p-6">
            <h3 className="text-[20px] font-semibold uppercase leading-[1.2]">{icon}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {iconCards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  inLoadout={loadout.includes(card.id)}
                  violating={violatingSet.has(card.id)}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className="flex flex-col gap-2 rounded border border-[#e2e8f0] bg-white p-6">
        <h3 className="text-[20px] font-semibold leading-[1.2]">Passives</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {passives.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              inLoadout={loadout.includes(card.id)}
              violating={violatingSet.has(card.id)}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
