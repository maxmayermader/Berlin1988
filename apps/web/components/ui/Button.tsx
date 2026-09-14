'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { HOVER_TRANSITION_CLASS } from '../../lib/motion.js';

/**
 * A game-agnostic primitive. ui/ components never import @berlin/engine —
 * apps/web/components/CLAUDE.md. `apps/web/lib/motion.ts` is dependency-free
 * plumbing, so importing `HOVER_TRANSITION_CLASS` from it does not violate
 * that rule.
 */

export type ButtonVariant = 'primary' | 'destructive' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  /** Renders disabled with reduced opacity and no spinner — D-10 permits no
   *  animation beyond the resolution step transitions; this was never
   *  motion-based, so the reduced-motion preference does not affect it. */
  pending?: boolean;
  children: ReactNode;
}

/**
 * `enabled:` gates every hover fill so a `pending`/`disabled` button (which
 * renders at `disabled:opacity-50`) never brightens under the cursor as if
 * it were actionable (T-04-17). Hover fills are one step darker than each
 * variant's base fill (04-UI-SPEC.md Color section); `ghost` gets the
 * transition class but no fill change — hover fills are reserved for the
 * primary and destructive variants only.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[#2563eb] text-white enabled:hover:bg-[#1d4ed8]',
  destructive: 'bg-[#dc2626] text-white enabled:hover:bg-[#b91c1c]',
  ghost: 'bg-transparent text-[#0f172a] border border-[#e2e8f0]',
};

export function Button({ variant = 'primary', pending = false, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      className={`rounded px-4 py-2 text-base font-semibold disabled:opacity-50 ${HOVER_TRANSITION_CLASS} ${VARIANT_CLASSES[variant]}`}
      {...rest}
    >
      {children}
    </button>
  );
}
