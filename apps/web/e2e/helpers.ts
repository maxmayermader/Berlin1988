import { expect, type Page } from '@playwright/test';

/**
 * Shared setup for the solo-host specs.
 *
 * Every one of these tests was written against the match shape v1.0's
 * hardcoded config produced: duel-12, one agent per player. Both are now
 * host settings (Phase 6, LOBBY-08/MAP-03), and their defaults have moved —
 * a fresh 4-seat lobby plays FFA-18 with two agents each. Rather than weaken
 * the assertions that depend on that shape (twelve duel-12 node names,
 * exactly one agent token on the board), these helpers ask for it through
 * the real host controls, which also keeps the settings UI on the tested
 * path rather than around it.
 */

/**
 * A fresh lobby with one agent per seat, leaving the seat count at its
 * default of four — the host plus three auto-filled bots, which is the
 * shape these specs were written against.
 *
 * One agent (rather than the new default of two) because these tests treat
 * "the host submitted" as "the host's seat is committed", and a seat is only
 * committed once every one of its agents is.
 */
export async function createSoloLobby(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
  await page.getByRole('button', { name: '1 agent', exact: true }).click();
}

/**
 * The duel map, one agent each — two seats, so MAP-03 selects duel-12.
 *
 * Only for specs that actually depend on that map (duel-12's twelve node
 * names) or on the host owning exactly one agent token. Specs that need the
 * round to stay open after the host submits should use `createSoloLobby`
 * instead: with a single bot opponent, that bot has usually already released
 * its order by the time the host submits, so the round closes instantly and
 * the composer — clock included — is replaced by the step-through.
 */
export async function createDuelLobby(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);

  // Two seats -> duel-12 (MAP-03). The host plus one auto-filled bot.
  await page.getByRole('button', { name: '2', exact: true }).first().click();
  await expect(page.getByText('Duel-12 (12 nodes)')).toBeVisible();

  // One agent each, so a single commit closes this seat's orders.
  await page.getByRole('button', { name: '1 agent', exact: true }).click();
}

/** Ready up and wait for the room to start the match. */
export async function readyAndStart(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ready Up' }).click();
  await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });
}

/**
 * Compose one action into the next open slot by name, then aim it if it
 * needs a target.
 *
 * The composer is a two-step picker now (ORDER-07): choosing the operation
 * first is what makes a board click unambiguous when a node is a legal
 * target for more than one action. `chooseAction(page, 'Hold')` covers the
 * target-less case; `chooseMove` covers the targeted one.
 */
export async function chooseAction(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label }).first().click();
}

/** Pick Move, then click whichever legal target the board highlights. */
export async function chooseMove(page: Page): Promise<void> {
  await chooseAction(page, 'Move');
  const legalTarget = page.locator('[data-legal-target="move"]').first();
  await expect(legalTarget).toBeVisible();
  const box = await legalTarget.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}
