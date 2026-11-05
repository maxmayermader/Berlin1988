import Link from 'next/link';
import { CreateJoinPanel } from '../components/home/CreateJoinPanel.js';
import { KickedBanner } from '../components/home/KickedBanner.js';
import { OpenLobbies } from '../components/home/OpenLobbies.js';
import { Folder } from '../components/ui/Folder.js';
import { PageTransition } from '../components/ui/PageTransition.js';
import { Stamp } from '../components/ui/Stamp.js';

/** The four networks, from docs/GAME_DESIGN.md §1 and §3.1. */
const NETWORKS = [
  { shape: '●', name: 'Stasi', where: 'East Berlin', color: 'var(--color-sector-red)' },
  { shape: '■', name: 'CIA station', where: 'West Berlin', color: 'var(--color-sector-blue)' },
  { shape: '◆', name: 'The corridor', where: 'Checkpoints & bridges', color: 'var(--color-sector-gold)' },
  { shape: '▲', name: 'U-Bahn runners', where: 'Under both', color: 'var(--color-sector-green)' },
] as const;

const BRIEFING = [
  'Field one or two hidden agents. Every round, everyone writes two secret orders per agent — then it all happens at once.',
  'Strikes kill whoever stands on the target, but the shot is heard: neighbours learn exactly where you fired from.',
  'Agents never come back. From round 7 the city starts sealing districts, and anyone caught inside is gone.',
  'Win by carrying three dossiers home, burning every rival, or leading on score when the clock runs out.',
] as const;

export default function HomePage() {
  return (
    <PageTransition className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <KickedBanner />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* The cover sheet. */}
        <div className="manila relative overflow-hidden rounded-[4px] px-6 pb-8 pt-20 shadow-sheet sm:px-10 sm:pt-10">
          <div className="absolute right-5 top-5 sm:right-8 sm:top-7">
            <Stamp tilt={8} className="text-lg sm:text-2xl">
              Top secret
            </Stamp>
          </div>
          <p className="label-caps text-ink-muted">Operation file · Autumn 1988</p>
          <h1 className="mt-3 font-display text-5xl leading-none tracking-[0.04em] sm:text-7xl">Berlin 1988</h1>
          <p className="mt-4 max-w-md text-lg">
            A Cold War hidden-movement game for one to four players. The Wall has fourteen months to live, and nobody
            in this file knows it.
          </p>

          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {NETWORKS.map((n) => (
              <li key={n.name} className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="text-lg leading-none" style={{ color: n.color }}>
                  {n.shape}
                </span>
                <b>{n.name}</b>
                <span className="text-ink-muted">— {n.where}</span>
              </li>
            ))}
          </ul>

          <div className="paper mt-7 rounded-[2px] border border-rule p-4 shadow-[1px_2px_0_0_var(--color-rule)]">
            <h2 className="label-caps text-ink-muted">Briefing</h2>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-snug marker:font-bold">
              {BRIEFING.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>

          <p className="mt-6 text-sm text-ink-muted">
            Empty seats are filled by AI handlers with their own personalities. Play solo, or send the join code to
            friends.
          </p>
        </div>

        <div className="flex flex-col gap-8">
          <Folder tab="New operation" surface="paper" bodyClassName="flex flex-col gap-4 p-5">
            <CreateJoinPanel />
          </Folder>

          <Folder tab="Open lobbies" bodyClassName="p-5">
            <OpenLobbies />
          </Folder>

          <Link
            href="/deck"
            className="group flex items-center justify-between gap-3 rounded-[3px] border-2 border-on-desk-muted/40 px-4 py-3 text-on-desk transition-colors hover:border-on-desk hover:bg-white/5"
          >
            <span className="flex flex-col">
              <span className="font-display text-lg leading-tight">Build Loadout</span>
              <span className="text-sm text-on-desk-muted">Pick the ten cards you carry into every match.</span>
            </span>
            <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}
