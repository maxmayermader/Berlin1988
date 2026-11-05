'use client';

import { isActive, isPassive } from '@berlin/engine';
import { ICONS, type Card, type CardId, type Sector } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
import { cardFlipVariant } from '../../lib/motion.js';
import { SECTOR_COLOR } from '../../lib/sectors.js';
import { SectorGlyph } from '../intel/SectorGlyph.js';
import { Button } from '../ui/Button.js';
import { Stamp } from '../ui/Stamp.js';

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

/** The theme's sector inks (lib/sectors.ts) — a sector swatch is always
 *  paired with its shape and uppercase text label, never color alone
 *  (apps/web/components/CLAUDE.md). */
const SECTOR_SWATCH: Record<Sector, string> = SECTOR_COLOR;

interface CardTileProps {
  card: Card;
  inLoadout: boolean;
  violating: boolean;
  /** Read once by the parent grid and passed down — CardTile renders 34
   *  times, so it never reads the reduced-motion preference itself. */
  reducedMotion: boolean | null;
  onAdd: (id: CardId) => void;
  onRemove: (id: CardId) => void;
}

/** One tile: name, sector swatch + its text label, icon name, BP cost, the
 *  card's own text (never truncated), a Consumable/Permanent tag for
 *  passives, and a single Add/Remove toggle — never a stepper, since
 *  validateLoadout() has no duplicate-id rule at all. Selecting/deselecting
 *  flips the tile (Motion Contract item 4) — keyed on `inLoadout` so
 *  React remounts it and the flip fires on every membership change; under
 *  reduced motion this degrades to an instant state swap, never withheld. */
function CardTile({ card, inLoadout, violating, reducedMotion, onAdd, onRemove }: CardTileProps) {
  return (
    <motion.div
      key={inLoadout ? 'in' : 'out'}
      data-card-id={card.id}
      {...cardFlipVariant(reducedMotion)}
      className={`paper relative flex flex-col gap-1.5 overflow-hidden rounded-[3px] border p-3 pt-0 shadow-[1px_2px_0_0_var(--color-rule)] ${
        violating ? 'border-2 border-stamp' : inLoadout ? 'border-2 border-ink' : 'border-rule'
      }`}
    >
      <div
        className="-mx-3 mb-1 flex items-center gap-1.5 px-3 py-1.5"
        style={{ borderTop: `5px solid ${SECTOR_SWATCH[card.sector]}`, borderBottom: '1px dashed var(--color-rule)' }}
      >
        <SectorGlyph sector={card.sector} size={12} />
        <span className="label-caps">{card.sector}</span>
        <span className="label-caps text-ink-muted">· {card.icon}</span>
        <span className="ml-auto rounded-full border border-ink/40 px-1.5 text-xs font-bold tabular-nums">
          {card.budgetPoints} BP
        </span>
      </div>
      <p className="font-display text-lg leading-tight">{card.name}</p>
      <p className="text-sm leading-snug">{card.text}</p>
      {isActive(card) && (
        <p className="label-caps text-[0.62rem] text-ink-muted">
          {card.intelCost} Intel · cooldown {card.cooldown}
        </p>
      )}
      {isPassive(card) && (
        <span className="label-caps text-[0.62rem] text-ink-muted">
          {card.consumable ? 'Consumable' : 'Permanent'}
        </span>
      )}
      {violating && <p className="text-sm font-bold text-stamp">Over the {card.icon} limit</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {inLoadout ? (
          <Stamp tone="ok" tilt={-5} className="text-xs">
            In your file
          </Stamp>
        ) : (
          <span />
        )}
        <Button
          variant={inLoadout ? 'ghost' : 'primary'}
          onClick={() => (inLoadout ? onRemove(card.id) : onAdd(card.id))}
        >
          {inLoadout ? 'Remove' : 'Add'}
        </Button>
      </div>
    </motion.div>
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
  // Read once for the whole grid, not once per tile (CardTile renders 34
  // times) — passed down as a prop.
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-8">
      {ICONS.map((icon) => {
        const iconCards = cards.filter((c) => c.icon === icon && !isPassive(c));
        return (
          <section key={icon} className="flex flex-col gap-2.5">
            <h3 className="border-b-2 border-ink/70 pb-1 font-display text-xl uppercase leading-none tracking-[0.06em]">{icon}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {iconCards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  inLoadout={loadout.includes(card.id)}
                  violating={violatingSet.has(card.id)}
                  reducedMotion={reducedMotion}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className="flex flex-col gap-2.5">
        <h3 className="border-b-2 border-ink/70 pb-1 font-display text-xl leading-none tracking-[0.06em]">Passives</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {passives.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              inLoadout={loadout.includes(card.id)}
              violating={violatingSet.has(card.id)}
              reducedMotion={reducedMotion}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
