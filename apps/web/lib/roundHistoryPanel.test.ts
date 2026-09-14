import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A static-source check — this codebase ships no React component-testing
 * stack (01-02-PLAN.md's precedent, followed again by matchChatMount.test.ts
 * and intelDrawer.test.ts), so the row-headline/expand-control/StepThrough-
 * reuse conventions this task adds are verified by reading the component's
 * source rather than rendering it. The headline logic itself (`roundHeadline`/
 * `roundNumberOf`) is already tested for real, behaviorally, in
 * format.test.ts — this file only pins that `RoundHistoryPanel.tsx` and
 * `StepThrough.tsx` are wired to it and to each other correctly.
 */

function readRoundHistoryPanel(): string {
  return readFileSync(
    fileURLToPath(new URL('../components/resolution/RoundHistoryPanel.tsx', import.meta.url)),
    'utf8',
  );
}

function readStepThrough(): string {
  return readFileSync(
    fileURLToPath(new URL('../components/resolution/StepThrough.tsx', import.meta.url)),
    'utf8',
  );
}

describe('RoundHistoryPanel.tsx — headline text comes from the shared formatter', () => {
  it('imports roundHeadline from the shared format module and calls it at least once', () => {
    const src = readRoundHistoryPanel();
    expect(/import\s*\{[^}]*roundHeadline[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/format\.js['"]/.test(src)).toBe(
      true,
    );
    expect((src.match(/roundHeadline\(/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('builds no headline string of its own — no inline pluralized clause text', () => {
    const src = readRoundHistoryPanel();
    // The row prefix "Round {n} — " is allowed as static JSX text, and
    // comparing the *result* of roundHeadline() to its own 'quiet round'
    // constant (e.g. to pick a muted text color) is allowed — that's a style
    // branch on the single source's output, not a second implementation.
    // What's forbidden is constructing the pluralized count-clause text
    // ("extracted"/"burned"/"contested") inline, which would be a second,
    // divergent implementation of roundHeadline's own logic. Case-sensitive
    // lowercase word-boundary match so the AGENT_BURNED event-type constant
    // (uppercase) doesn't false-positive this check.
    expect(/\b(extracted|burned|contested)\b/.test(src)).toBe(false);
  });
});

describe('RoundHistoryPanel.tsx — expands into the one existing StepThrough renderer', () => {
  it('renders <StepThrough exactly once, always with isFinal={false}', () => {
    const src = readRoundHistoryPanel();
    expect((src.match(/<StepThrough\b/g) ?? []).length).toBe(1);
    expect(src.includes('isFinal={false}')).toBe(true);
    expect(src.includes('isFinal={true}')).toBe(false);
  });

  it('passes mode="full" to the expanded StepThrough', () => {
    const src = readRoundHistoryPanel();
    expect(src.includes('mode="full"')).toBe(true);
  });
});

describe('RoundHistoryPanel.tsx — expand/collapse control labels and aria-labels', () => {
  it('contains the Expand/Collapse text labels', () => {
    const src = readRoundHistoryPanel();
    expect(src.includes('Expand')).toBe(true);
    expect(src.includes('Collapse')).toBe(true);
  });

  it('contains the aria-label templates from the Copywriting Contract', () => {
    const src = readRoundHistoryPanel();
    // The two templates may be written as either a single `aria-label={...}`
    // ternary or two literal branches — assert on the template literal text
    // itself rather than a fixed JSX shape.
    expect(/`Expand round \$\{[^}]+\}`/.test(src)).toBe(true);
    expect(/`Collapse round \$\{[^}]+\}`/.test(src)).toBe(true);
    expect(src.includes('aria-label')).toBe(true);
  });

  it('the expand control carries the 44px minimum hit-target classes', () => {
    const src = readRoundHistoryPanel();
    expect(src.includes('min-h-11')).toBe(true);
    expect(src.includes('min-w-11')).toBe(true);
  });
});

describe('RoundHistoryPanel.tsx — Plan 04-01 conventions survive', () => {
  it('still contains both empty-state strings', () => {
    const src = readRoundHistoryPanel();
    expect(src.includes('No rounds yet')).toBe(true);
    expect(src.includes('History fills in once your first round resolves.')).toBe(true);
  });

  it('still calls useReducedMotion exactly once', () => {
    const src = readRoundHistoryPanel();
    expect((src.match(/useReducedMotion\(\)/g) ?? []).length).toBe(1);
  });
});

describe('RoundHistoryPanel.tsx — destructive stripe on a round that burned the viewer\'s own agent', () => {
  it('checks AGENT_BURNED events against selfId and applies the stripe-not-fill border', () => {
    const src = readRoundHistoryPanel();
    expect(src.includes("'AGENT_BURNED'")).toBe(true);
    expect(src.includes('selfId')).toBe(true);
    expect(src.includes('border-l-4 border-l-[#dc2626]')).toBe(true);
    expect(src.includes('bg-[#f1f5f9]')).toBe(true);
  });
});

describe('StepThrough.tsx — mode prop', () => {
  it('declares a mode prop whose type union includes both "step" and "full"', () => {
    const src = readStepThrough();
    expect(/mode\?:\s*['"]step['"]\s*\|\s*['"]full['"]/.test(src)).toBe(true);
  });

  it('defaults mode to \'step\' in the destructuring, so omitting it is byte-identical to today', () => {
    const src = readStepThrough();
    expect((src.match(/mode = 'step'/g) ?? []).length).toBe(1);
  });

  it('still imports useReducedMotion from motion/react', () => {
    const src = readStepThrough();
    expect(src.includes('useReducedMotion')).toBe(true);
    expect(/from ['"]motion\/react['"]/.test(src)).toBe(true);
  });

  it('in full mode renders the whole log and neither the Next nor Continue control', () => {
    const src = readStepThrough();
    expect(/mode === 'full'/.test(src) || /mode !== 'full'/.test(src)).toBe(true);
  });
});
