import { expect, type BrowserContext, type Page, test } from '@playwright/test';

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

const READY_CLEARED_BANNER =
  "Editing your loadout — your ready status has been cleared. Ready up again when you're done.";
const DIVERGENCE_NOTICE = 'Your loadout has unsaved changes — this match will use your last saved loadout.';

/**
 * The lobby's own once-per-join auto-submit (Plan 02-01) sends whatever is
 * already in localStorage the moment JOINED lands, so lastAcceptedCards
 * (the divergence notice's own input) is populated a moment after a fresh
 * lobby connection — before that ack lands, a real edit-then-back-out would
 * be indistinguishable from "nothing ever submitted" (loadoutsDiverge's own
 * null case). Listening for the literal inbound LOADOUT_ACK frame is the
 * same technique deck.spec.ts uses for the outbound SUBMIT_LOADOUT frame.
 * The listener must be attached before the page navigates, so it is a
 * separate step from the poll that waits on it.
 */
function trackReceivedFrames(page: Page): string[] {
  const receivedFrames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') receivedFrames.push(frame.payload);
    });
  });
  return receivedFrames;
}

async function waitForLoadoutAck(receivedFrames: readonly string[]): Promise<void> {
  await expect
    .poll(() => receivedFrames.some((raw) => raw.includes('LOADOUT_ACK')), { timeout: 10_000 })
    .toBe(true);
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

  test('the ready-cleared banner appears even when the seat was never ready, with the contracted copy', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);

    // Opens the editor with no prior Ready Up click — 02-UI-SPEC.md
    // requires the banner on every open, never conditionally hidden.
    await page.getByRole('button', { name: 'Edit Loadout' }).click();
    await expect(page.getByText(READY_CLEARED_BANNER)).toBeVisible();
  });

  test('the ready-cleared banner never appears on the home-page deckbuilder, which has no ready state to clear', async ({
    page,
  }) => {
    await page.goto('/deck');
    await expect(page.getByText(READY_CLEARED_BANNER)).toHaveCount(0);
  });

  test('backing out with a changed draft shows the divergence notice; an unchanged back-out shows none; a save clears it', async ({
    page,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());
    const receivedFrames = trackReceivedFrames(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    await waitForLoadoutAck(receivedFrames); // lastAcceptedCards is now populated

    // Unchanged back-out: the draft still equals what was just accepted.
    await page.getByRole('button', { name: 'Edit Loadout' }).click();
    await page.getByRole('button', { name: 'Back to Lobby' }).click();
    await expect(page.getByText(DIVERGENCE_NOTICE)).toHaveCount(0);

    // Changed back-out: load a different, legal preset and back out
    // without saving — the notice names the consequence.
    await page.getByRole('button', { name: 'Edit Loadout' }).click();
    await page.getByRole('button', { name: 'Load Hunter' }).click();
    await page.getByRole('button', { name: 'Back to Lobby' }).click();
    await expect(page.getByText(DIVERGENCE_NOTICE)).toBeVisible();

    // A save clears it — there is only one deck again.
    await page.getByRole('button', { name: 'Edit Loadout' }).click();
    await page.getByRole('button', { name: 'Load Hunter' }).click();
    await page.getByRole('button', { name: 'Save Loadout' }).click();
    await expect(page.getByRole('button', { name: 'Edit Loadout' })).toBeVisible();
    await expect(page.getByText(DIVERGENCE_NOTICE)).toHaveCount(0);
  });

  test("the other seat's rendered vocabulary is unchanged across an open-edit-save sequence (no editing indicator leaked)", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

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

    await pageB.goto('/');
    await pageB.getByPlaceholder('Enter join code').fill(code);
    await pageB.getByRole('button', { name: 'Join Game' }).click();
    await pageB.waitForURL(`/lobby/${code}`);

    const hostRowOnB = pageB.locator('li', { hasText: HOST_CODENAME });
    // 02-CONTEXT.md's Deferred Ideas: no dedicated "Player X is editing"
    // indicator was requested, and this stays true under test — compared
    // against B's own pre-edit content, so a differently-worded indicator
    // can't slip past a check for one specific forbidden phrase.
    const vocabularyBeforeEdit = await hostRowOnB.textContent();

    // Open, edit, and save — but stop short of re-readying, which is the
    // one sanctioned signal (Task 1's own test already covers that flip).
    // Everything in between must leave B's row exactly as it was.
    await pageA.getByRole('button', { name: 'Edit Loadout' }).click();
    await pageA.getByRole('button', { name: 'Load Hunter' }).click();
    await pageA.getByRole('button', { name: 'Save Loadout' }).click();
    await expect(pageA.getByRole('button', { name: 'Edit Loadout' })).toBeVisible();

    expect(await hostRowOnB.textContent()).toBe(vocabularyBeforeEdit);

    await contextA.close();
    await contextB.close();
  });
});
