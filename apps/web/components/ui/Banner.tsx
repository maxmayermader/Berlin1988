'use client';

import type { ReactNode } from 'react';

/**
 * A game-agnostic primitive. ui/ components never import @berlin/engine or
 * @berlin/shared — apps/web/components/CLAUDE.md.
 *
 * Destructive is the left border stripe only, never the panel fill —
 * 03-UI-SPEC.md's Color section reserves destructive that way, mirroring
 * 02-UI-SPEC.md's violation-row precedent.
 */

export interface BannerProps {
  children: ReactNode;
  onDismiss: () => void;
}

export function Banner({ children, onDismiss }: BannerProps) {
  return (
    <div className="paper flex items-start justify-between gap-3 rounded-[3px] border-l-4 border-l-stamp px-4 py-3 text-base shadow-lift">
      <p>{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="min-h-8 min-w-8 shrink-0 text-lg text-ink-muted"
      >
        ×
      </button>
    </div>
  );
}
