'use client';

import { ALL_CARDS } from '@berlin/engine';
import Link from 'next/link';
import { useEffect } from 'react';
import { Deckbuilder } from '../../components/deck/Deckbuilder.js';
import { PageTransition } from '../../components/ui/PageTransition.js';
import { useLoadoutStore } from '../../lib/loadoutStore.js';

/**
 * HOME-04's entry point — localStorage only, no room connection. Never
 * imports the network chokepoint (apps/web/lib/CLAUDE.md rule 1): a player
 * can build and persist a loadout before any lobby or match exists.
 */
export default function DeckPage() {
  const loadout = useLoadoutStore((s) => s.loadout);
  const hydrated = useLoadoutStore((s) => s.hydrated);
  const hydrate = useLoadoutStore((s) => s.hydrate);
  const loadPreset = useLoadoutStore((s) => s.loadPreset);
  const add = useLoadoutStore((s) => s.add);
  const remove = useLoadoutStore((s) => s.remove);
  const saveStatus = useLoadoutStore((s) => s.saveStatus);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <PageTransition className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link href="/" className="label-caps text-on-desk-muted hover:text-on-desk">
          ← Berlin 1988
        </Link>
        <h1 className="font-display text-3xl leading-none text-on-desk sm:text-4xl">Build Loadout</h1>
        <p className="max-w-2xl text-sm text-on-desk-muted">
          Ten cards ride with you into every match: reusable operations gated by Intel and cooldown, and passive
          insurance that fires on its own. Your file saves in this browser and is sent to every lobby you join.
        </p>
      </header>
      <div className="manila rounded-[4px] p-4 shadow-sheet sm:p-6">
        {!hydrated ? (
          <p className="text-sm">Loading…</p>
        ) : (
          <Deckbuilder
            loadout={loadout}
            cards={ALL_CARDS}
            onAdd={add}
            onRemove={remove}
            onLoadPreset={loadPreset}
            saveStatus={saveStatus}
          />
        )}
      </div>
    </PageTransition>
  );
}
