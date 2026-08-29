import { ALL_CARDS } from '@berlin/engine';
import { expect, type Page, test } from '@playwright/test';

/**
 * The phase's tracer, browser half: HOME-04 (one link from home, no login),
 * DECK-03 (one-click preset load, confirm-guarded), DECK-04 (persists across
 * a refresh), and the literal outbound SUBMIT_LOADOUT frame the lobby sends
 * once JOINED lands — the seam the room-side apps/party/tests/loadout.test.ts
 * proves from the other direction. Plan 02-02 adds the full card grid and
 * live legality meter: every card the engine ships, an Add/Remove toggle
 * per tile, and a persistent readout that updates in the same interaction.
 *
 * 'st_red' (HUNTER's RED Strike card) and 'dc_green' (PHANTOM's GREEN Decoy
 * card) are each in exactly one of the two starter presets — chosen from
 * packages/engine/src/content/loadouts.ts's own card lists, never re-typed.
 */
const HUNTER_ONLY_CARD_ID = 'st_red';
const PHANTOM_ONLY_CARD_ID = 'dc_green';
const LOADOUT_STORAGE_KEY = 'berlin1988.loadout';

/** Plan 02-02's CardGrid tags all 34 tiles with data-card-id too, so any
 *  assertion about "the current draft" scopes to this summary list
 *  (Deckbuilder.tsx's `data-testid="your-loadout"` block) rather than the
 *  page-wide `[data-card-id]` selector, which now also matches grid tiles. */
function yourLoadout(page: Page) {
  return page.locator('[data-testid="your-loadout"]');
}

test.describe('Deckbuilder — reachability, preset load, and persistence', () => {
  test('home link -> ten cards -> load Hunter -> persists across a refresh', async ({ page }) => {
    // Playwright dismisses native dialogs by default — without this, every
    // preset click's window.confirm() guard silently blocks the load and
    // this spec fails for the wrong reason.
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/');
    await page.getByRole('link', { name: 'Build Loadout' }).click();
    await page.waitForURL('/deck');

    await expect(yourLoadout(page).locator('[data-card-id]')).toHaveCount(10);

    await page.getByRole('button', { name: 'Load Hunter' }).click();

    await expect(yourLoadout(page).locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();
    await expect(yourLoadout(page).locator(`[data-card-id="${PHANTOM_ONLY_CARD_ID}"]`)).toHaveCount(0);

    await page.reload();

    await expect(yourLoadout(page).locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();
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
    await expect(yourLoadout(page).locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();

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

  test('a loadout survives a fresh browser session with no login (DECK-04)', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    pageA.on('dialog', (dialog) => dialog.accept());

    await pageA.goto('/');
    await pageA.getByRole('link', { name: 'Build Loadout' }).click();
    await pageA.waitForURL('/deck');
    await pageA.getByRole('button', { name: 'Load Hunter' }).click();
    await expect(yourLoadout(pageA).locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();

    const stored = await pageA.evaluate((key) => window.localStorage.getItem(key), LOADOUT_STORAGE_KEY);
    expect(stored).not.toBeNull();

    // A brand-new context has its own storage partition — no cookies, no
    // session, nothing carried over except what this addInitScript seeds.
    const contextB = await browser.newContext();
    await contextB.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key, value as string);
      },
      [LOADOUT_STORAGE_KEY, stored] as const,
    );
    const pageB = await contextB.newPage();
    await pageB.goto('/deck');

    await expect(yourLoadout(pageB).locator(`[data-card-id="${HUNTER_ONLY_CARD_ID}"]`)).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});

test.describe('Deckbuilder — full card grid, live add/remove, and a persistent meter', () => {
  test('the whole pool renders across seven sections, and adding/removing a card moves the readout live', async ({
    page,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/deck');

    // The grid tiles are the only data-card-id elements carrying an
    // Add/Remove button — the "your loadout" summary list renders plain
    // divs with no button. Count must equal ALL_CARDS.length (the engine's
    // own export), never a re-typed literal.
    const tiles = page.locator('[data-card-id]').filter({ has: page.getByRole('button') });
    await expect(tiles).toHaveCount(ALL_CARDS.length);

    // Seven sections (D-04): one <h3> per canonical icon plus one for
    // Passives.
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(7);

    // Load a known preset so the starting draft (and therefore the starting
    // meter numbers) are deterministic, then read the live card-count and
    // budget-point readouts before/after one add and one remove.
    await page.getByRole('button', { name: 'Load Phantom' }).click();

    const countBefore = await page.getByText(/\/10 cards/).textContent();
    const bpBefore = await page.getByText(/\/26 BP/).textContent();

    // 'ag_gold' (Corridor Transit, AGENT/GOLD) is not in PHANTOM
    // (packages/engine/src/content/loadouts.ts) — a safe card to add.
    const targetTile = page.locator('[data-card-id="ag_gold"]').filter({ has: page.getByRole('button') });
    await targetTile.getByRole('button', { name: 'Add' }).click();

    const countAfterAdd = await page.getByText(/\/10 cards/).textContent();
    const bpAfterAdd = await page.getByText(/\/26 BP/).textContent();
    expect(countAfterAdd).not.toBe(countBefore);
    expect(bpAfterAdd).not.toBe(bpBefore);

    await targetTile.getByRole('button', { name: 'Remove' }).click();

    const countAfterRemove = await page.getByText(/\/10 cards/).textContent();
    const bpAfterRemove = await page.getByText(/\/26 BP/).textContent();
    expect(countAfterRemove).toBe(countBefore);
    expect(bpAfterRemove).toBe(bpBefore);

    // The meter stays visible after the grid scrolls — it's pinned, not
    // merely present at the top of the page.
    await page.mouse.wheel(0, 2000);
    await expect(page.getByText(/\/10 cards/)).toBeVisible();
  });
});
