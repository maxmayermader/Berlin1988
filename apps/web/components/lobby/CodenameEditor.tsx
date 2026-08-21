'use client';

import { useState } from 'react';
import { CODENAME_MAX_LENGTH } from '../../lib/identity.js';

export interface CodenameEditorProps {
  value: string;
  ready: boolean;
  onSubmit: (codename: string) => void;
}

/**
 * D-09's rename-before-ready affordance: an input capped at
 * CODENAME_MAX_LENGTH, disabled once the local seat is ready. The cap here
 * is UX only — packages/shared/src/protocol.ts's codenameSchema enforces it
 * authoritatively on every SET_CODENAME frame.
 */
export function CodenameEditor({ value, ready, onSubmit }: CodenameEditorProps) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      value={draft}
      disabled={ready}
      maxLength={CODENAME_MAX_LENGTH}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed.length > 0 && trimmed !== value) onSubmit(trimmed);
      }}
      className="rounded border border-[#e2e8f0] px-3 py-2 text-base focus:border-[#2563eb] focus:outline-none disabled:opacity-50"
    />
  );
}
