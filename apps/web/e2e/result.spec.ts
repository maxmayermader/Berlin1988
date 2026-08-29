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
 *
 * A host who only ever Holds is a stationary target — HANDLER-tier bots can
 * and do kill the host's single agent before round 14 (D-02 locks
 * agentsPerPlayer to 1 this phase, so that's the host's *only* agent). Once
 * that happens `OrderComposer` shows "No living agents — nothing to order."
 * instead of a Submit button, `allCommitted()` no longer waits on a host who
 * has nothing left to commit, and the room races through the remaining
 * rounds on bot timing alone — with or without this test clicking through
 * each step-through report. The loop below submits an order only when one is
 * actually there to submit, and otherwise just waits for the next frame,
 * which is what makes it correct in both the host-survives and
 * host-is-eliminated-mid-match cases.
 */
test.describe('Result — a full match reaches the result screen', () => {
  test('a seeded match against three bots ends with a winner headline and a contracted reason', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    await page.getByRole('button', { name: 'Ready Up' }).click();
    await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    // ResultScreen renders the only <h1> on this route (StepThrough and the
    // board use <h2>), so it's a stable, unambiguous "the match ended" signal.
    const resultHeadline = page.getByRole('heading', { level: 1 });
    const roundResolvedHeading = page.getByRole('heading', { name: /^Round \d+ resolved$/ });
    const submitButton = page.getByRole('button', { name: 'Submit Orders' });

    // roundLimit is locked to 14 (apps/party/src/settings.ts) — well more
    // than enough passes even accounting for the host dying mid-match and
    // several rounds resolving between two client-visible snapshots.
    for (let i = 0; i < 25; i++) {
      if (await resultHeadline.isVisible().catch(() => false)) break;

      if (await submitButton.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Hold' }).click();
        await page.getByRole('button', { name: 'Hold' }).click();
        await submitButton.click();
      }

      await Promise.race([
        resultHeadline.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined),
        roundResolvedHeading.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined),
      ]);

      if (await resultHeadline.isVisible().catch(() => false)) break;
      if (!(await roundResolvedHeading.isVisible().catch(() => false))) continue;

      const next = page.getByRole('button', { name: 'Next', exact: true });
      let guard = 0;
      while ((await next.count()) > 0 && guard++ < 50) {
        await next.click().catch(() => undefined);
      }
      const continueButton = page.getByRole('button', { name: /^Continue to Round \d+$/ });
      if ((await continueButton.count()) > 0) {
        await continueButton.click().catch(() => undefined);
      }
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
