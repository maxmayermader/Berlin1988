'use client';

import { useEffect } from 'react';
import { Deckbuilder } from '../../components/deck/Deckbuilder.js';
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

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-16">
      <h1 className="text-[28px] font-semibold leading-[1.2]">Build Loadout</h1>
      {!hydrated ? (
        <p className="text-sm">Loading…</p>
      ) : (
        <Deckbuilder loadout={loadout} onLoadPreset={loadPreset} />
      )}
    </main>
  );
}
