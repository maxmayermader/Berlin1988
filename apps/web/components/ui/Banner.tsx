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
    <div className="flex items-start justify-between gap-3 rounded border-l-4 border-l-[#dc2626] bg-[#f1f5f9] px-4 py-3 text-base text-[#0f172a]">
      <p>{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-sm text-[#64748b]"
      >
        ×
      </button>
    </div>
  );
}
