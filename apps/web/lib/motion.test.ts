import { describe, expect, it } from 'vitest';
import {
  DURATION,
  EASING,
  HOVER_TRANSITION_CLASS,
  cardFlipVariant,
  fadeSlideUpVariant,
} from './motion.js';

/**
 * D-08 / POLISH-01: real behavioural assertions, not string matching —
 * apps/web/lib/motion.ts is a plain importable module (deliberately no
 * `motion/react` import, no `useReducedMotion` call), so this is a genuine
 * unit test with a green baseline that breaks if a future edit reintroduces
 * a per-component reduced-motion branch (<testing_note> at the top of the plan).
 */

describe('DURATION / EASING tokens', () => {
  it('DURATION has the three documented values', () => {
    expect(DURATION.fast).toBe(0.15);
    expect(DURATION.base).toBe(0.25);
    expect(DURATION.slow).toBe(0.35);
  });

  it('EASING.standard is the ease-out curve', () => {
    expect(EASING.standard).toEqual([0.4, 0, 0.2, 1]);
  });
});

describe('fadeSlideUpVariant', () => {
  it('is an instant cut under reduced motion — initial is exactly false', () => {
    expect(fadeSlideUpVariant(true).initial).toBe(false);
  });

  it('animates normally when reducedMotion is null (media query not yet resolved)', () => {
    const initial = fadeSlideUpVariant(null).initial;
    expect(initial).not.toBe(false);
    expect(initial).toMatchObject({ opacity: 0 });
  });

  it('uses DURATION.base and EASING.standard for its transition', () => {
    const variant = fadeSlideUpVariant(false);
    expect(variant.transition.duration).toBe(DURATION.base);
    expect(variant.transition.ease).toBe(EASING.standard);
  });

  it('animate is identical regardless of the reduced-motion argument — content is never withheld', () => {
    const a = fadeSlideUpVariant(true).animate;
    const b = fadeSlideUpVariant(false).animate;
    const c = fadeSlideUpVariant(null).animate;
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe('cardFlipVariant', () => {
  it('is an instant cut under reduced motion — initial is exactly false', () => {
    expect(cardFlipVariant(true).initial).toBe(false);
  });

  it('uses DURATION.slow for its transition', () => {
    expect(cardFlipVariant(false).transition.duration).toBe(DURATION.slow);
  });

  it('carries a rotateY in its non-reduced initial state', () => {
    const initial = cardFlipVariant(false).initial;
    expect(initial).not.toBe(false);
    expect(initial).toMatchObject({ rotateY: -90 });
  });

  it('animate is identical regardless of the reduced-motion argument — content is never withheld', () => {
    const a = cardFlipVariant(true).animate;
    const b = cardFlipVariant(false).animate;
    const c = cardFlipVariant(null).animate;
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe('HOVER_TRANSITION_CLASS', () => {
  it('is a CSS class string, not a motion variant — deliberately outside the reduced-motion branch', () => {
    expect(HOVER_TRANSITION_CLASS).toContain('transition-colors');
    expect(typeof HOVER_TRANSITION_CLASS).toBe('string');
  });
});
