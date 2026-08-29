import { expect, test } from '@playwright/test';

/**
 * Phase 1 Success Criterion 1, executable: create a game and receive a
 * unique join code, second browser enters it and lands in the same lobby.
 */
test.describe('Home — create and join by code', () => {
  test('two browser contexts: create then join by code, both see two seats', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('/');
    await pageA.getByRole('button', { name: 'Create Game' }).click();
    await pageA.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    const code = pageA.url().split('/lobby/')[1] ?? '';
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto('/');
    await pageB.getByPlaceholder('Enter join code').fill(code);
    await pageB.getByRole('button', { name: 'Join Game' }).click();
    await pageB.waitForURL(`/lobby/${code}`);

    await expect(pageA.locator('li', { hasText: 'Open Seat' })).toHaveCount(2);
    await expect(pageB.locator('li', { hasText: 'Open Seat' })).toHaveCount(2);

    await contextA.close();
    await contextB.close();
  });

  test('an unknown code shows the exact error copy and the route does not change', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter join code').fill('ZZZZZZ');
    await page.getByRole('button', { name: 'Join Game' }).click();
    await expect(
      page.getByText("That code doesn't match an open lobby. Double-check it and try again."),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('the join-code input carries the exact placeholder copy', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('Enter join code')).toBeVisible();
  });
});
