'use client';

import type { PlayerView } from '@berlin/shared';
import { useState } from 'react';
import type { EventContext } from '../../lib/format.js';
import { HOVER_TRANSITION_CLASS } from '../../lib/motion.js';
import { useSignalStore } from '../../lib/signalStore.js';
import { SignalsLog } from '../intel/SignalsLog.js';
import { RoundHistoryPanel } from '../resolution/RoundHistoryPanel.js';
import { MapLegend } from './MapLegend.js';

export interface MatchFileProps {
  view: PlayerView;
  ctx: EventContext;
}

type FileTab = 'signals' | 'history' | 'legend';

const TAB_LABEL: Record<FileTab, string> = {
  signals: 'Intercepts',
  history: 'History',
  legend: 'Legend',
};

/**
 * The working file under the map: the signals log (INTEL-02), the round
 * history (MATCH-06) and the map legend, as folder tabs. Replaces v1.0's
 * corner drawer — information a player consults every round belongs next
 * to the map it refers to, not behind a toggle.
 */
export function MatchFile({ view, ctx }: MatchFileProps) {
  const [tab, setTab] = useState<FileTab>('signals');
  const signalCount = useSignalStore((s) => s.log.length);

  return (
    <section aria-label="Match file" className="flex min-w-0 flex-col">
      <div className="flex items-end gap-1 pl-1" role="tablist" aria-label="Match file">
        {(Object.keys(TAB_LABEL) as FileTab[]).map((option) => {
          const selected = tab === option;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              id={`file-tab-${option}`}
              aria-selected={selected}
              aria-controls={`file-panel-${option}`}
              onClick={() => setTab(option)}
              className={`folder-tab relative px-4 pt-2 font-display text-[15px] leading-none tracking-[0.05em] ${HOVER_TRANSITION_CLASS} ${
                selected ? 'manila z-10 -mb-px pb-2' : 'bg-manila-2/70 pb-1.5 text-ink/80 hover:bg-manila-2'
              }`}
            >
              {TAB_LABEL[option]}
              {option === 'signals' && signalCount > 0 && (
                <span className="ml-1.5 font-type text-xs font-bold text-ink-muted">({signalCount})</span>
              )}
              {option === 'history' && view.history.length > 0 && (
                <span className="ml-1.5 font-type text-xs font-bold text-ink-muted">({view.history.length})</span>
              )}
            </button>
          );
        })}
      </div>
      <div
        id={`file-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`file-tab-${tab}`}
        className="manila max-h-[26rem] min-h-40 overflow-y-auto rounded-[4px] rounded-tl-none p-4 shadow-sheet"
      >
        {tab === 'signals' && <SignalsLog map={view.map} />}
        {tab === 'history' && <RoundHistoryPanel history={view.history} selfId={view.self.id} ctx={ctx} />}
        {tab === 'legend' && <MapLegend />}
      </div>
    </section>
  );
}
