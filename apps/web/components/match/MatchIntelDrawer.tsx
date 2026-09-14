'use client';

import type { PlayerView } from '@berlin/shared';
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { fadeSlideUpVariant, HOVER_TRANSITION_CLASS } from '../../lib/motion.js';
import { BurnTrackPanel } from '../intel/BurnTrackPanel.js';
import { RoundHistoryPanel } from '../resolution/RoundHistoryPanel.js';

/**
 * MATCH-06 / MATCH-07: bottom-left corner dock, collapsed by default,
 * hosting the two Intel surfaces as tabs — Round History and Burn Track.
 * Copies `MatchChat.tsx`'s container classes verbatim per UI-SPEC, changing
 * only the side — bottom-left so it never overlaps `MatchChat`'s existing
 * bottom-right dock.
 */

const COLLAPSED_LABEL = 'Intel';

type IntelTab = 'history' | 'burnTrack';

const TAB_LABEL: Record<IntelTab, string> = {
  history: 'History',
  burnTrack: 'Burn Track',
};

export interface MatchIntelDrawerProps {
  view: PlayerView;
}

export function MatchIntelDrawer({ view }: MatchIntelDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<IntelTab>('history');
  const [seenCount, setSeenCount] = useState(0);
  const reducedMotion = useReducedMotion();

  // D-07: only the viewer's own track is ever reachable from this UI — no
  // control exists for browsing another player's track this phase.
  const ownTrack = view.burnTracks[view.self.id] ?? [];
  const badgeCount = Math.max(0, ownTrack.length - seenCount);

  function handleExpand() {
    setExpanded(true);
  }

  function handleSelectTab(next: IntelTab) {
    setTab(next);
    if (next === 'burnTrack') setSeenCount(ownTrack.length);
  }

  if (!expanded) {
    return (
      <div className="fixed bottom-4 left-4">
        <button
          type="button"
          onClick={handleExpand}
          className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-[#e2e8f0] bg-[#ffffff] px-4 py-2 text-base font-semibold hover:bg-[#f1f5f9] ${HOVER_TRANSITION_CLASS}`}
        >
          {COLLAPSED_LABEL}
          {badgeCount > 0 && (
            <span className="rounded-full bg-[#2563eb] px-2 text-sm text-white">{badgeCount}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <motion.div
      {...fadeSlideUpVariant(reducedMotion)}
      className="fixed bottom-4 left-4 flex h-96 w-80 flex-col gap-4 rounded border border-[#e2e8f0] bg-[#ffffff] p-6 shadow"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {(Object.keys(TAB_LABEL) as IntelTab[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelectTab(option)}
              className={`min-h-11 rounded border px-3 py-1 text-sm font-semibold ${
                tab === option
                  ? 'border-[#2563eb] text-[#2563eb]'
                  : 'border-[#e2e8f0] bg-[#f1f5f9] text-[#64748b]'
              }`}
            >
              {TAB_LABEL[option]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Collapse"
          className="min-h-11 min-w-11 text-sm text-[#64748b]"
        >
          ×
        </button>
      </div>
      {tab === 'history' ? (
        <RoundHistoryPanel history={view.history} selfId={view.self.id} />
      ) : (
        <BurnTrackPanel entries={ownTrack} />
      )}
    </motion.div>
  );
}
