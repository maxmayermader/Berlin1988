import { expect, test } from '@playwright/test';

/**
 * The phase's tracer, browser half: HOME-04 (one link from home, no login),
 * DECK-03 (one-click preset load, confirm-guarded), DECK-04 (persists across
 * a refresh), and the literal outbound SUBMIT_LOADOUT frame the lobby sends
 * once JOINED lands — the seam the room-side apps/party/tests/loadout.test.ts
 * proves from the other direction.
 *
 * 'st_red' (HUNTER's RED Strike card) and 'dc_green' (PHANTOM's GREEN Decoy
 * card) are each in exactly one of the two starter presets — chosen from
 * packages/engine/src/content/loadouts.ts's own card lists, never re-typed.
 */
const HUNTER_ONLY_CARD_ID = 'st_red';
const PHANTOM_ONLY_CARD_ID = 'dc_green';

test.describe('Deckbuilder — reachability, preset load, and persistence', () => {
  test('home link -> ten cards -> load Hunter -> persists across a refresh', async ({ page }) => {
    // Playwright dismisses native dialogs by default — without this, every
    // preset click's window.confirm() guard silently blocks the load and
    // this spec fails for the wrong reason.
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/');
    await page.getByRole('link', { name: 'Build Loadout' }).click();
    await page.waitForURL('/deck');

    await expect(page.locator('[data-card-id]')).toHaveCount(10);

    await page.getByRole('button', { name: 'Load Hunter' }).click();

    await expect(page.locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();
    await expect(page.locator(`[data-card-id="${PHANTOM_ONLY_CARD_ID}"]`)).toHaveCount(0);

    await page.reload();

    await expect(page.locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();
  });

  test('a loadout built on /deck reaches the room as the literal SUBMIT_LOADOUT frame', async ({ page }) => {
    test.setTimeout(60_000);
    page.on('dialog', (dialog) => dialog.accept());

    const sentFrames: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        if (typeof frame.payload === 'string') sentFrames.push(frame.payload);
      });
    });

    await page.goto('/');
    await page.getByRole('link', { name: 'Build Loadout' }).click();
    await page.waitForURL('/deck');
    await page.getByRole('button', { name: 'Load Hunter' }).click();
    await expect(page.locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);

    await expect
      .poll(
        () =>
          sentFrames.some((raw) => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              return false;
            }
            const message = parsed as { type?: unknown; cards?: unknown };
            return (
              message.type === 'SUBMIT_LOADOUT' &&
              Array.isArray(message.cards) &&
              message.cards.includes(HUNTER_ONLY_CARD_ID)
            );
          }),
        { timeout: 10_000 },
      )
      .toBe(true);
  });
});
