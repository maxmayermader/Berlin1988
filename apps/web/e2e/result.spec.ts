import { expect, test } from '@playwright/test';

/**
 * Phase 1 Success Criterion 5, client half: a full match against three bots
 * reaches the result screen, which names the engine's winner and states the
 * engine's reason. One seeded match — same base case as match.spec.ts and
 * resolution.spec.ts (solo host, three auto-filled bots) — driven round by
 * round with the identical Hold/Hold/Submit pattern resolution.spec.ts
 * already uses, since a single 90s-deadline wait per round would blow any
 * reasonable Playwright timeout: closing every round on commit, not on the
 * deadline, is what keeps this spec fast.
 */
test.describe('Result — a full match reaches the result screen', () => {
  test('a seeded match against three bots ends with a winner headline and a contracted reason', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    await page.getByRole('button', { name: 'Ready Up' }).click();
    await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    // ResultScreen renders the only <h1> on this route (StepThrough and the
    // board use <h2>), so it's a stable, unambiguous "the match ended" signal.
    const resultHeadline = page.getByRole('heading', { level: 1 });
    const roundResolvedHeading = page.getByRole('heading', { name: /^Round \d+ resolved$/ });

    // roundLimit is locked to 14 (apps/party/src/settings.ts) — at most 14
    // submissions are ever needed, whichever OutcomeReason actually fires.
    for (let round = 0; round < 16; round++) {
      await page.getByRole('button', { name: 'Hold' }).click();
      await page.getByRole('button', { name: 'Hold' }).click();
      await page.getByRole('button', { name: 'Submit Orders' }).click();

      await Promise.race([
        resultHeadline.waitFor({ state: 'visible', timeout: 30_000 }),
        roundResolvedHeading.waitFor({ state: 'visible', timeout: 30_000 }),
      ]);

      if (await resultHeadline.isVisible()) break;

      // Not the final round — click through the report exactly like
      // resolution.spec.ts, then continue to the next round's composer.
      const next = page.getByRole('button', { name: 'Next', exact: true });
      let guard = 0;
      while ((await next.count()) > 0 && guard++ < 50) {
        await next.click();
      }
      await page.getByRole('button', { name: /^Continue to Round \d+$/ }).click();
    }

    await expect(resultHeadline).toBeVisible();
    // "{Codename} wins" (single winner) or "{A} and {B} win" (a round-limit
    // tie) — either way the headline names a winner, never "No winner.".
    await expect(resultHeadline).toHaveText(/wins?$/);

    // One of the three Copywriting Contract sentences, verbatim
    // (apps/web/lib/result.ts / 01-UI-SPEC.md) — never a computed summary.
    await expect(
      page.getByText(
        /^(3 dossiers extracted\.|All opposing agents eliminated\.|Round \d+ reached — .+ led on score\.)$/,
      ),
    ).toBeVisible();

    // The composer and the step-through are both gone — replaced entirely.
    await expect(page.getByRole('button', { name: 'Submit Orders' })).toHaveCount(0);
    await expect(roundResolvedHeading).toHaveCount(0);
  });
});
