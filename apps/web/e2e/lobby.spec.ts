import { expect, type BrowserContext, test } from '@playwright/test';

/**
 * DECK-05 end to end, across two browser contexts: a seated player opens the
 * deckbuilder from inside the lobby — the same component `/deck` uses — the
 * room's ready broadcast (D-05) is what the *other* player sees flip off,
 * the player rebuilds and saves, readies again, and the match starts with
 * both players in it. The saved deck's actual contents are asserted
 * server-side in apps/party/tests/loadout.test.ts; Playwright has no access
 * to GameState (02-04-PLAN.md's own note, mirroring Plan 02-01's tracer
 * split).
 *
 * Identities are seeded via addInitScript so each context's SeatList row is
 * addressable by a fixed codename rather than the randomly generated one
 * apps/web/lib/identity.ts would otherwise produce.
 */
const IDENTITY_STORAGE_KEY = 'berlin1988.identity';
const HOST_CODENAME = 'Iron Falcon';
const GUEST_CODENAME = 'Grey Wolf';

async function seedIdentity(context: BrowserContext, playerId: string, codename: string): Promise<void> {
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value as string);
    },
    [IDENTITY_STORAGE_KEY, JSON.stringify({ playerId, codename })] as const,
  );
}

test.describe('Lobby — in-lobby deckbuilder (DECK-05, D-05)', () => {
  test('open the editor, ready clears for the other player, edit, save, ready again, both reach the match', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const contextA = await browser.newContext();
    await seedIdentity(contextA, 'player-a', HOST_CODENAME);
    const pageA = await contextA.newPage();
    pageA.on('dialog', (dialog) => dialog.accept());

    const contextB = await browser.newContext();
    await seedIdentity(contextB, 'player-b', GUEST_CODENAME);
    const pageB = await contextB.newPage();

    await pageA.goto('/');
    await pageA.getByRole('button', { name: 'Create Game' }).click();
    await pageA.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    const code = pageA.url().split('/lobby/')[1] ?? '';
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    await pageB.goto('/');
    await pageB.getByPlaceholder('Enter join code').fill(code);
    await pageB.getByRole('button', { name: 'Join Game' }).click();
    await pageB.waitForURL(`/lobby/${code}`);

    const hostRowOnB = pageB.locator('li', { hasText: HOST_CODENAME });

    // A readies up; B (the *other* context — the only place D-05 can
    // honestly be observed) sees the ready badge appear.
    await pageA.getByRole('button', { name: 'Ready Up' }).click();
    await expect(hostRowOnB).toContainText('Ready ✓');

    // A opens the editor. D-05: this clears ready through the existing
    // broadcast — observed here from B's own local state, not A's.
    await pageA.getByRole('button', { name: 'Edit Loadout' }).click();
    await expect(hostRowOnB).toContainText('Not ready');

    // A rebuilds into a specific, identifiable, legal deck and saves.
    await pageA.getByRole('button', { name: 'Load Hunter' }).click();
    await pageA.getByRole('button', { name: 'Save Loadout' }).click();

    // A successful save returns to the lobby view — the editor is gone.
    await expect(pageA.getByRole('button', { name: 'Edit Loadout' })).toBeVisible();

    // A readies again — re-confirmation is required (D-05); the CTA itself
    // never re-readies the player (02-UI-SPEC.md).
    await pageA.getByRole('button', { name: 'Ready Up' }).click();
    await pageB.getByRole('button', { name: 'Ready Up' }).click();

    // Server-authoritative countdown (10s) + bot auto-fill — both contexts
    // navigate themselves once RoomState.phase turns IN_GAME.
    await pageA.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });
    await pageB.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    await contextA.close();
    await contextB.close();
  });

  test('Save Loadout is disabled while the draft is short of ten cards, and enabled once legal again', async ({
    page,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);

    await page.getByRole('button', { name: 'Edit Loadout' }).click();
    await page.getByRole('button', { name: 'Load Hunter' }).click();

    const saveButton = page.getByRole('button', { name: 'Save Loadout' });
    await expect(saveButton).toBeEnabled();

    // Remove one of Hunter's ten cards (via the grid tile, not the
    // button-less "your loadout" summary) to drop the draft to nine —
    // a player's own mistake, not a hand-constructed pathological deck.
    const target = page.locator('[data-card-id="ag_red"]').filter({ has: page.getByRole('button') });
    await target.getByRole('button', { name: 'Remove' }).click();
    await expect(saveButton).toBeDisabled();

    await target.getByRole('button', { name: 'Add' }).click();
    await expect(saveButton).toBeEnabled();
  });
});
