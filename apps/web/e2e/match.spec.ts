import { expect, test } from '@playwright/test';

/**
 * Phase 1 Success Criterion 3, client half: a player who readied up lands on
 * the Berlin board, sees only their own agent, composes a two-action order
 * from the engine's own legality answers, and gets a server ack.
 *
 * One human readies up alone in a fresh lobby — hitting the >=50% threshold
 * by itself — and waits out the real countdown so three bots auto-fill and
 * the match actually starts, exactly like a solo player would.
 */
test.describe('Match — board, order composition, and submission', () => {
  test('ready up alone, land on the board, compose and submit a two-action order', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);

    await page.getByRole('button', { name: 'Ready Up' }).click();
    await expect(page.getByRole('button', { name: 'Ready ✓', exact: true })).toBeVisible();

    // Server-authoritative countdown (10s) + bot auto-fill + createMatch —
    // the lobby page navigates itself once RoomState.phase turns IN_GAME.
    await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    // Twelve duel-12 node labels, rendered entirely from PlayerView.map.
    const nodeNames = [
      'Kurfürstendamm',
      'Tiergarten',
      'Tempelhof',
      'Kreuzberg',
      'Bernauer Straße',
      'Gesundbrunnen',
      'Checkpoint Charlie',
      'Friedrichstraße',
      'Glienicke Bridge',
      'Alexanderplatz',
      'Prenzlauer Berg',
      'Karl-Marx-Allee',
    ];
    for (const name of nodeNames) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // Compose: click an adjacent legal node (slot 1, a MOVE), then Hold
    // (slot 2). The board only highlights nodes legalOrders() actually
    // returned, so whichever legal-target ring is on screen is a real MOVE.
    const legalTarget = page.locator('[data-legal-target="move"]').first();
    await expect(legalTarget).toBeVisible();
    const box = await legalTarget.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await page.getByRole('button', { name: 'Hold' }).click();

    const submit = page.getByRole('button', { name: 'Submit Orders' });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText('Order locked in.')).toBeVisible({ timeout: 15_000 });

    // Fog: exactly one agent token renders on the board — the viewer's own.
    // AgentToken is the only element using this exact accent fill, and
    // OpponentPublicInfo has no field that could ever supply a second one.
    await expect(page.locator('circle[fill="#2563eb"]')).toHaveCount(1);

    // Second, independent scan: the whole served document, checked for any
    // agent id at all (this phase's createMatch mints every agent id as
    // "<seatId>:a1", D-02's single-agent-per-player lock) — not even the
    // viewer's own id is ever serialized into the DOM, so a bot seat's id
    // can't be either.
    const html = await page.content();
    expect(html).not.toContain(':a1');
  });
});
