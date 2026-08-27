import { expect, test } from '@playwright/test';

/**
 * Phase 1 Success Criteria 3 and 4, client half: while composing, a player
 * sees the live "N of M submitted" count and a countdown, both derived from
 * server-sent values; when the round resolves, the composer is replaced by
 * a click-to-advance report that replays the round one event at a time, in
 * the engine's own order, and returns to composing on "Continue".
 *
 * One human readies up alone against three auto-filled bots, exactly like
 * apps/web/e2e/match.spec.ts's base case — the round timer (90s, D-04) is
 * long enough that the human's single agent submitting is what actually
 * closes the round (the bots decide in 1.5-4s per apps/party/src/bots.ts).
 */
test.describe('Resolution — HUD and step-through', () => {
  test('watch the count and clock while composing, then step through the resolved round', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    await page.getByRole('button', { name: 'Ready Up' }).click();
    await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    // Composing: the counter and the clock are both visible and
    // server-derived before any submission.
    await expect(page.getByText(/^\d+ of \d+ submitted$/)).toBeVisible();
    const clock = page.getByText(/^\d+:\d{2}$/);
    await expect(clock).toBeVisible();
    const firstReading = await clock.textContent();

    // Compose and submit — a MOVE then a Hold, same pattern as match.spec.ts.
    const legalTarget = page.locator('[data-legal-target="move"]').first();
    await expect(legalTarget).toBeVisible();
    const box = await legalTarget.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.getByRole('button', { name: 'Hold' }).click();
    await page.getByRole('button', { name: 'Submit Orders' }).click();
    await expect(page.getByText('Order locked in.')).toBeVisible({ timeout: 15_000 });

    // The clock is still decreasing on its own, not a paused/frozen value.
    await page.waitForTimeout(1_200);
    const secondReading = await clock.textContent();
    expect(secondReading).not.toBe(firstReading);

    // The round resolves once every bot has also committed — the step-through
    // replaces the composer. Exactly one row (ROUND_START) is visible first.
    const rows = page.locator('ol[aria-live="polite"] > li');
    await expect(page.getByRole('heading', { name: /^Round \d+ resolved$/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(rows).toHaveCount(1);

    // Click Next until the log is exhausted, then Continue.
    const next = page.getByRole('button', { name: 'Next', exact: true });
    let guard = 0;
    while ((await next.count()) > 0 && guard++ < 50) {
      await next.click();
    }

    const continueButton = page.getByRole('button', { name: /^Continue to Round \d+$/ });
    await expect(continueButton).toBeVisible();
    const rowCountAfterExhaustion = await rows.count();
    expect(rowCountAfterExhaustion).toBeGreaterThanOrEqual(1);

    await continueButton.click();

    // Back to composing, one round later.
    await expect(page.getByRole('button', { name: 'Submit Orders' })).toBeVisible();
    await expect(page.getByText(/^0 of \d+ submitted$/)).toBeVisible();
  });
});
