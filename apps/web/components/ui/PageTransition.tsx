'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { fadeSlideUpVariant } from '../../lib/motion.js';

/**
 * Gives any route root a `fadeSlideUp` mount entry (04-UI-SPEC.md Motion
 * Contract item 7) without making the route itself a client component.
 *
 * `apps/web/app/page.tsx` is a Server Component, and `motion/react` cannot
 * be imported into one. This wrapper receives already-rendered
 * server-rendered `children` and only the wrapper itself needs the client
 * boundary — putting `'use client'` on the route instead would ship the
 * whole route's JS to the browser for the sake of one fade, which is
 * exactly what `apps/web/app/CLAUDE.md`'s "default to Server Components"
 * rule exists to prevent.
 */
export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.main {...fadeSlideUpVariant(reducedMotion)} className={className}>
      {children}
    </motion.main>
  );
}
