'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * A game-agnostic primitive. ui/ components never import @berlin/engine —
 * apps/web/components/CLAUDE.md.
 */

export type ButtonVariant = 'primary' | 'destructive' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  /** Renders disabled with reduced opacity and no spinner — D-10 permits no
   *  animation beyond the resolution step transitions. */
  pending?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[#2563eb] text-white',
  destructive: 'bg-[#dc2626] text-white',
  ghost: 'bg-transparent text-[#0f172a] border border-[#e2e8f0]',
};

export function Button({ variant = 'primary', pending = false, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      className={`rounded px-4 py-2 text-base font-semibold disabled:opacity-50 ${VARIANT_CLASSES[variant]}`}
      {...rest}
    >
      {children}
    </button>
  );
}
