import { describe, expect, it } from 'vitest';
import { URGENT_THRESHOLD_SECONDS, clockLabel, isUrgent, secondsRemaining } from './clock.js';

describe('secondsRemaining', () => {
  it('reaches exactly 0 at the deadline — the timer reaches zero rather than skipping from 1 to a transition', () => {
    const deadline = 1_000_000;
    expect(secondsRemaining(deadline, deadline)).toBe(0);
  });

  it('never goes negative once the deadline has passed, holding at 0', () => {
    const deadline = 1_000_000;
    expect(secondsRemaining(deadline, deadline + 5_000)).toBe(0);
  });

  it('is 0 for a null deadline and does not throw', () => {
    expect(() => secondsRemaining(null, Date.now())).not.toThrow();
    expect(secondsRemaining(null, Date.now())).toBe(0);
  });

  it('reads exactly 90 for a freshly set 90-second deadline (D-04)', () => {
    const now = 2_000_000;
    const deadline = now + 90_000;
    expect(secondsRemaining(deadline, now)).toBe(90);
  });

  it('rounds up a fractional remainder rather than truncating', () => {
    const now = 0;
    const deadline = 1_500; // 1.5s remaining
    expect(secondsRemaining(deadline, now)).toBe(2);
  });
});

describe('clockLabel', () => {
  it('renders m:ss with a zero-padded seconds field', () => {
    expect(clockLabel(90)).toBe('1:30');
    expect(clockLabel(5)).toBe('0:05');
    expect(clockLabel(0)).toBe('0:00');
  });

  it('never renders a fractional component', () => {
    expect(clockLabel(59.7)).toBe('0:59');
  });
});

describe('isUrgent', () => {
  it(`is true at exactly URGENT_THRESHOLD_SECONDS (${URGENT_THRESHOLD_SECONDS}) and below`, () => {
    expect(URGENT_THRESHOLD_SECONDS).toBe(10);
    expect(isUrgent(10)).toBe(true);
    expect(isUrgent(1)).toBe(true);
    expect(isUrgent(0)).toBe(true);
  });

  it('is false above the threshold', () => {
    expect(isUrgent(11)).toBe(false);
    expect(isUrgent(90)).toBe(false);
  });
});
