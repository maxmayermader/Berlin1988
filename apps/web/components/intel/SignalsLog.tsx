'use client';

import type { MapDefinition, Signal } from '@berlin/shared';
import { SECTOR_TERRITORY } from '../../lib/sectors.js';
import {
  audienceOf,
  groupByRound,
  highlightOf,
  isAlarming,
  isRedacted,
  roundDigest,
  signalKey,
  signalLabel,
} from '../../lib/signals.js';
import { useSignalStore } from '../../lib/signalStore.js';
import { SectorGlyph } from './SectorGlyph.js';

export interface SignalsLogProps {
  map: MapDefinition;
}

/**
 * INTEL-02..05: the intercept log. Every signal the room has delivered this
 * match, grouped by round with a one-line digest, newest first. A signal
 * that names a node or sector can be selected to light that place up on the
 * map. Public facts and eyes-only facts are tagged differently, and a
 * strike reported by sector only shows the withheld node as a redaction
 * bar instead of a silent gap.
 */
export function SignalsLog({ map }: SignalsLogProps) {
  const log = useSignalStore((s) => s.log);
  const highlight = useSignalStore((s) => s.highlight);
  const setHighlight = useSignalStore((s) => s.setHighlight);
  const rounds = groupByRound(log);

  if (rounds.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        The wire is quiet. Intercepts, chatter and public reports arrive here at the end of each round.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-ink-muted">
        <span className="flex items-center gap-1">
          <AudienceTag audience="eyes-only" /> only you received it
        </span>
        <span className="flex items-center gap-1">
          <AudienceTag audience="public" /> every player received it
        </span>
        <span>Select a line to mark it on the map.</span>
      </p>
      {rounds.map(({ round, signals }) => (
        <section key={round} aria-label={`Round ${round} signals`} className="flex flex-col gap-1">
          <header className="flex items-baseline justify-between gap-2 border-b border-dashed border-rule pb-0.5">
            <h4 className="label-caps">Round {round} briefing</h4>
            <span className="text-right text-[0.7rem] text-ink-muted">{roundDigest(signals)}</span>
          </header>
          <ul className="flex flex-col gap-0.5">
            {signals.map((signal) => (
              <SignalRow
                key={signalKey(signal)}
                signal={signal}
                map={map}
                selected={isSelected(signal, highlight)}
                onSelect={() => {
                  const target = highlightOf(signal);
                  setHighlight(isSelected(signal, highlight) ? null : target);
                }}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function isSelected(signal: Signal, highlight: ReturnType<typeof highlightOf>): boolean {
  const target = highlightOf(signal);
  if (!target || !highlight) return false;
  return target.nodeId === highlight.nodeId && target.sector === highlight.sector;
}

function AudienceTag({ audience }: { audience: 'public' | 'eyes-only' }) {
  return audience === 'public' ? (
    <span className="label-caps rounded-[2px] border border-ink-muted px-1 text-[0.55rem] leading-4 text-ink-muted">Public</span>
  ) : (
    <span className="label-caps rounded-[2px] bg-stamp px-1 text-[0.55rem] leading-4 text-paper">Eyes only</span>
  );
}

function SignalRow({
  signal,
  map,
  selected,
  onSelect,
}: {
  signal: Signal;
  map: MapDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const target = highlightOf(signal);
  const alarming = isAlarming(signal.kind);
  const redacted = isRedacted(signal);
  const place = target?.nodeId
    ? (map.nodes.find((n) => n.id === target.nodeId)?.name ?? null)
    : target?.sector
      ? SECTOR_TERRITORY[target.sector]
      : null;

  const body = (
    <>
      <span className="flex w-full items-center gap-1.5">
        <AudienceTag audience={audienceOf(signal.kind)} />
        <span className={`label-caps text-[0.62rem] ${alarming ? 'text-stamp' : 'text-ink-muted'}`}>
          {signalLabel(signal.kind)}
        </span>
        {target?.sector && <SectorGlyph sector={target.sector} size={10} />}
        {place && <span className="ml-auto truncate text-[0.65rem] text-ink-muted">⌖ {place}</span>}
      </span>
      <span className="text-[0.84rem] leading-snug">
        {signal.text}
        {redacted && (
          <>
            {' '}
            <span className="whitespace-nowrap text-[0.7rem] text-ink-muted">
              Exact node: <span className="redacted" role="img" aria-label="withheld" />
            </span>
          </>
        )}
      </span>
    </>
  );

  return (
    <li>
      {target ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={`flex w-full flex-col items-start gap-0.5 rounded-[2px] px-1.5 py-1 text-left transition-colors ${
            selected ? 'bg-highlight/25 outline outline-1 outline-highlight' : 'hover:bg-ink/5'
          }`}
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-col gap-0.5 px-1.5 py-1">{body}</div>
      )}
    </li>
  );
}
