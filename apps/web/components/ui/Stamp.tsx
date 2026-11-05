import type { CSSProperties, ReactNode } from 'react';

/**
 * A rubber stamp — CLASSIFIED, BURNED, ELIMINATED, LOCKED IN. The ink
 * colour is the tone; the double border, tilt and worn-ink mask come from
 * the `stamp` utility in globals.css.
 *
 * `animate` drops it in with a thunk (`animate-stamp-in`); globals.css
 * collapses that to an instant cut under prefers-reduced-motion.
 *
 * Game-agnostic: ui/ never imports the engine or shared types.
 */
export type StampTone = 'stamp' | 'accent' | 'ink' | 'ok';

const TONE_CLASS: Record<StampTone, string> = {
  stamp: 'text-stamp',
  accent: 'text-accent',
  ink: 'text-ink',
  ok: 'text-ok',
};

export interface StampProps {
  children: ReactNode;
  tone?: StampTone;
  /** Degrees; negative tilts left. */
  tilt?: number;
  animate?: boolean;
  className?: string;
}

export function Stamp({ children, tone = 'stamp', tilt = -4, animate = false, className = '' }: StampProps) {
  const style = { '--stamp-tilt': `${tilt}deg` } as CSSProperties;
  return (
    <span
      style={style}
      className={`stamp ${TONE_CLASS[tone]} ${animate ? 'animate-stamp-in' : ''} ${className}`}
    >
      {children}
    </span>
  );
}
