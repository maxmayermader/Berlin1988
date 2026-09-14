/**
 * D-08: the single home for every duration/easing token and for the
 * `prefers-reduced-motion` conditional. New animated components import a
 * ready-made variant from here instead of re-deriving the
 * `reducedMotion ? false : {...}` branch inline — `StepThrough.tsx` is the
 * pattern this module generalizes.
 *
 * Deliberately framework-agnostic: no `'use client'` directive and no import
 * from `motion/react`, so a plain node-environment vitest file can import
 * and exercise this module directly (apps/web's testing_note). Callers pass
 * the result of their own reduced-motion media-query hook in; this file
 * never reads that preference itself.
 */

export const DURATION = { fast: 0.15, base: 0.25, slow: 0.35 } as const;

export const EASING = { standard: [0.4, 0, 0.2, 1] as [number, number, number, number] };

/** CSS-only hover/focus treatment — deliberately never suppressed under
 *  reduced motion (UI-SPEC Motion Contract reduced-motion policy bullet 2):
 *  color/opacity transitions carry no vestibular risk. */
export const HOVER_TRANSITION_CLASS = 'transition-colors duration-150';

/**
 * A fade + slide-up entry, for row/list-item mounts and panel expand/collapse.
 * Under reduced motion, `initial` is `false` — an instant cut, never a
 * zero-duration tween that still flashes.
 */
export function fadeSlideUpVariant(reducedMotion: boolean | null) {
  return {
    initial: reducedMotion ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.base, ease: EASING.standard },
  } as const;
}

/**
 * A card-flip reveal, for the deckbuilder tile select/deselect affordance and
 * the Burn Track entry call-out. Under reduced motion this resolves to an
 * instant state swap — the content is never withheld, only its transition
 * is removed.
 */
export function cardFlipVariant(reducedMotion: boolean | null) {
  return {
    initial: reducedMotion ? false : { rotateY: -90, opacity: 0 },
    animate: { rotateY: 0, opacity: 1 },
    transition: { duration: DURATION.slow, ease: EASING.standard },
  } as const;
}
