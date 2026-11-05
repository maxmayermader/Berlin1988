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
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's width. */
  block?: boolean;
  /** Renders disabled with reduced opacity and no spinner. */
  pending?: boolean;
  children: ReactNode;
}

/**
 * Typed-label buttons: heavy ink border, uppercase typewriter caps, a hard
 * offset shadow that collapses on press like a key going down.
 *
 * `enabled:` gates every hover fill so a `pending`/`disabled` button (which
 * renders at `disabled:opacity-50`) never brightens under the cursor as if
 * it were actionable (T-04-17). Hover fills are one step darker than each
 * variant's base fill; `ghost` inherits the surrounding text colour so the
 * same button reads on the desk and on paper.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-accent-strong bg-accent text-paper enabled:hover:bg-accent-strong shadow-[3px_3px_0_0_var(--color-accent-strong)]',
  destructive:
    'border-stamp-strong bg-stamp text-paper enabled:hover:bg-stamp-strong shadow-[3px_3px_0_0_var(--color-stamp-strong)]',
  ghost: 'border-current/45 bg-transparent text-current enabled:hover:bg-current/10',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 py-2 text-sm',
  lg: 'min-h-13 px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  pending = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      className={`inline-flex items-center justify-center gap-2 rounded-[3px] border-2 font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50 enabled:active:translate-x-[2px] enabled:active:translate-y-[2px] enabled:active:shadow-none ${HOVER_TRANSITION_CLASS} ${SIZE_CLASSES[size]} ${block ? 'w-full' : ''} ${VARIANT_CLASSES[variant]}`}
      {...rest}
    >
      {children}
    </button>
  );
}
