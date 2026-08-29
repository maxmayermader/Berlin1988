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

  test('reduced motion: every revealed row is still visible and readable', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    await page.getByRole('button', { name: 'Ready Up' }).click();
    await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Hold' }).click();
    await page.getByRole('button', { name: 'Hold' }).click();
    await page.getByRole('button', { name: 'Submit Orders' }).click();
    await expect(page.getByText('Order locked in.')).toBeVisible({ timeout: 15_000 });

    const rows = page.locator('ol[aria-live="polite"] > li');
    await expect(page.getByRole('heading', { name: /^Round \d+ resolved$/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(rows.first()).toBeVisible();

    // The information is the point and the animation is only the delivery
    // (apps/web/components/board/CLAUDE.md rule 4) — every row that becomes
    // visible under reduced motion stays visible and legible, never
    // withheld pending a transition that isn't going to run.
    const next = page.getByRole('button', { name: 'Next', exact: true });
    let guard = 0;
    while ((await next.count()) > 0 && guard++ < 50) {
      await next.click();
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i)).toBeVisible();
      }
    }

    await expect(page.getByRole('button', { name: /^Continue to Round \d+$/ })).toBeVisible();
  });

  test('a second context sees the count rise by exactly one when the first submits, and renders four locked-in slots', async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('/');
    await pageA.getByRole('button', { name: 'Create Game' }).click();
    await pageA.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    const code = pageA.url().split('/lobby/')[1] ?? '';

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto('/');
    await pageB.getByPlaceholder('Enter join code').fill(code);
    await pageB.getByRole('button', { name: 'Join Game' }).click();
    await pageB.waitForURL(`/lobby/${code}`);

    // Both filled seats ready up — hits the room's >=50%-of-filled threshold
    // (apps/party/src/state.ts) — the two remaining open seats then auto-fill
    // with bots and the match starts, four seats total.
    await pageA.getByRole('button', { name: 'Ready Up' }).click();
    await pageB.getByRole('button', { name: 'Ready Up' }).click();
    await pageA.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });
    await pageB.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    // Four locked-in slots, whatever the human/bot split — MATCH-04's fixed
    // four-slot layout, never a reflow as seats fill.
    const slotsB = pageB.locator('[role="listitem"]');
    await expect(slotsB).toHaveCount(4);

    const countB = pageB.getByText(/^\d+ of \d+ submitted$/);
    const beforeText = await countB.textContent();
    const before = Number(beforeText!.split(' of ')[0]);

    // A submits — B never presses Submit, so B's own locked-in badge must
    // not appear, and B's count must rise by exactly one once the server
    // acknowledges A's order (T-1-25: the count never rises on a local
    // click, only on a server frame).
    await pageA.getByRole('button', { name: 'Hold' }).click();
    await pageA.getByRole('button', { name: 'Hold' }).click();
    await pageA.getByRole('button', { name: 'Submit Orders' }).click();
    await expect(pageA.getByText('Order locked in.')).toBeVisible({ timeout: 15_000 });

    await expect(countB).toHaveText(new RegExp(`^${before + 1} of \\d+ submitted$`), {
      timeout: 15_000,
    });

    // B has not submitted — B's own Submit button is still enabled/present,
    // proving B's composer never optimistically marked itself locked in.
    await expect(pageB.getByRole('button', { name: 'Submit Orders' })).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
