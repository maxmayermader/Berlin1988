'use client';

import { cooldownRemaining, tryGetCard } from '@berlin/engine';
import type { CardId, PlayerView } from '@berlin/shared';
import { nodeName } from '../../lib/format.js';
import { SECTOR_COLOR } from '../../lib/sectors.js';
import { Folder } from '../ui/Folder.js';
import { SectorGlyph } from './SectorGlyph.js';

export interface OwnKitPanelProps {
  view: PlayerView;
}

/**
 * INTEL-01: everything the player holds that only they know — Intel,
 * silencers, safehouse, live traps and decoys, each agent's whereabouts and
 * cargo, and the 10-card loadout with every active's cooldown and every
 * passive's armed-or-spent state.
 *
 * All of it is `view.self`, which `projectView()` fills for the viewer
 * alone. Nothing is computed here: cooldowns come from the engine's own
 * `cooldownRemaining`, never client arithmetic.
 */
export function OwnKitPanel({ view }: OwnKitPanelProps) {
  const self = view.self;
  const agents = self.agents;

  return (
    <Folder tab="Your kit" aside="eyes only" bodyClassName="flex flex-col gap-3 p-3">
      <dl className="grid grid-cols-4 gap-1.5 text-center">
        <Stat label="Intel" value={self.intel} />
        <Stat label="Silencers" value={self.silencers} />
        <Stat label="Extracted" value={self.dossiersExtracted} />
        <Stat label="Burns" value={self.burnsInflicted} />
      </dl>

      <section aria-label="Your agents" className="flex flex-col gap-1">
        <h3 className="label-caps text-ink-muted">Agents</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {agents.map((agent, i) => (
            <li key={agent.id as string} className="flex items-center gap-2">
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  agent.alive ? 'text-paper' : 'border-2 border-stamp/70 text-stamp'
                }`}
                style={agent.alive ? { backgroundColor: SECTOR_COLOR[self.faction] } : undefined}
              >
                {agent.alive ? i + 1 : '✕'}
              </span>
              {agent.alive ? (
                <span className="min-w-0 truncate">
                  {nodeName(view.map, agent.nodeId)}
                  {agent.dossiers > 0 && (
                    <b className="text-ok">
                      {' '}
                      · {agent.dossiers} dossier{agent.dossiers === 1 ? '' : 's'}
                    </b>
                  )}
                  {agent.actionPenalty > 0 && <span className="text-stamp"> · −{agent.actionPenalty} action</span>}
                </span>
              ) : (
                <span className="font-bold uppercase tracking-wider text-stamp">Burned</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Your assets" className="flex flex-col gap-1 text-sm">
        <h3 className="label-caps text-ink-muted">Assets</h3>
        <p>
          <span className="text-ink-muted">Safehouse: </span>
          {self.safehouse ? <b>{nodeName(view.map, self.safehouse)}</b> : <i className="text-ink-muted">not established</i>}
        </p>
        {self.traps.length > 0 && (
          <p>
            <span className="text-ink-muted">Ambush{self.traps.length === 1 ? '' : 'es'}: </span>
            {self.traps.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ', '}
                <b>{nodeName(view.map, t.nodeId)}</b> <span className="text-ink-muted">(→R{t.expiresAfterRound})</span>
              </span>
            ))}
          </p>
        )}
        {self.decoys.length > 0 && (
          <p>
            <span className="text-ink-muted">Decoy{self.decoys.length === 1 ? '' : 's'}: </span>
            {self.decoys.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                <b>{nodeName(view.map, d.nodeId)}</b> <span className="text-ink-muted">(→R{d.expiresAfterRound})</span>
              </span>
            ))}
          </p>
        )}
        {self.knownBlockades.length > 0 && (
          <p>
            <span className="text-ink-muted">Kontrolle schedule: </span>
            {self.knownBlockades
              .filter((b) => b.round >= view.round)
              .slice(0, 4)
              .map((b, i) => (
                <span key={`${b.nodeId as string}-${b.round}`}>
                  {i > 0 && ', '}
                  {nodeName(view.map, b.nodeId)} R{b.round}
                </span>
              ))}
          </p>
        )}
      </section>

      <section aria-label="Your loadout" className="flex flex-col gap-1">
        <h3 className="label-caps text-ink-muted">Loadout</h3>
        <ul className="grid grid-cols-1 gap-1">
          {self.loadout.map((cardId, i) => (
            <LoadoutRow key={`${cardId as string}-${i}`} view={view} cardId={cardId} />
          ))}
        </ul>
      </section>
    </Folder>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="paper rounded-[2px] border border-rule px-1 py-1">
      <dt className="label-caps text-[0.58rem] text-ink-muted">{label}</dt>
      <dd className="text-lg font-bold tabular-nums leading-tight">{value}</dd>
    </div>
  );
}

function LoadoutRow({ view, cardId }: { view: PlayerView; cardId: CardId }) {
  const card = tryGetCard(cardId);
  if (!card) return null;

  let status: { text: string; tone: 'ok' | 'muted' | 'stamp' | 'accent' };
  if (card.kind === 'ACTIVE') {
    const remaining = cooldownRemaining(view.self, cardId);
    status =
      remaining > 0
        ? { text: `⟳ ${remaining} rd${remaining === 1 ? '' : 's'}`, tone: 'muted' }
        : { text: `${card.intelCost} Intel`, tone: 'ok' };
  } else if (!card.consumable) {
    status = { text: 'Always on', tone: 'accent' };
  } else if (view.self.passivesAvailable.includes(cardId)) {
    status = { text: 'Armed', tone: 'accent' };
  } else {
    status = { text: 'Spent', tone: 'stamp' };
  }

  const toneClass = {
    ok: 'text-ok',
    muted: 'text-ink-muted',
    stamp: 'text-stamp line-through decoration-2',
    accent: 'text-accent',
  }[status.tone];

  const spent = status.tone === 'stamp';
  const cooling = status.tone === 'muted';

  return (
    <li
      className={`paper flex items-center gap-2 rounded-[2px] border border-rule px-2 py-1 text-[0.8rem] ${spent || cooling ? 'opacity-70' : ''}`}
      title={`${card.name} — ${card.text}${card.kind === 'ACTIVE' ? ` (cooldown ${card.cooldown})` : ''}`}
      data-loadout-card={cardId as string}
    >
      <SectorGlyph sector={card.sector} size={11} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-bold">{card.name}</span>
        <span className="label-caps text-[0.55rem] text-ink-muted">
          {card.kind === 'PASSIVE' ? `passive · ${card.consumable ? 'single use' : 'permanent'}` : card.icon.toLowerCase()}
        </span>
      </span>
      <span className={`shrink-0 text-[0.72rem] font-bold tabular-nums ${toneClass}`}>{status.text}</span>
    </li>
  );
}
