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

  test('keyboard: arrow to an adjacent node and press Enter, same as a click would produce', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    await page.getByRole('button', { name: 'Ready Up' }).click();
    await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });
    await expect(page.getByText('Karl-Marx-Allee', { exact: true })).toBeVisible();

    // The host is always seat index 0 (RED, per packages/shared/src/enums.ts's
    // SECTORS order), so the agent always starts at karl_marx_allee. Its
    // only unambiguous single-neighbour compass direction is 'left', toward
    // Glienicke Bridge (apps/web/lib/board.ts's traversalOrder picks the
    // *closest* neighbour when more than one shares a direction, so 'up' is
    // deliberately not used here — it's ambiguous on the real map).
    const board = page.locator('svg[aria-label="Berlin map"]');
    await board.focus();
    await board.press('ArrowLeft');
    await board.press('Enter');

    await expect(page.getByText(/Move → glienicke_bridge/)).toBeVisible();
  });

  test('a rejected submission returns the composer to editable with the exact copy', async ({ page }) => {
    test.setTimeout(60_000);

    // Forward every frame to the real server untouched, except SUBMIT_ORDER:
    // that one is answered directly with a synthetic ORDER_REJECTED, proving
    // the composer's own handling of a server rejection without depending on
    // engineering a specific engine-side rejection through the UI (the
    // composer only ever offers legalOrders()-sanctioned actions by
    // construction, so no illegal order can be composed to trigger a real
    // one — apps/web/components/CLAUDE.md, RESEARCH.md Pitfall 2/2b).
    await page.routeWebSocket(/\/parties\/match\//, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        const text = typeof message === 'string' ? message : message.toString();
        let parsed: { type?: string; round?: number; agentId?: string } | null = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          server.send(message);
          return;
        }
        if (parsed?.type === 'SUBMIT_ORDER') {
          ws.send(
            JSON.stringify({
              type: 'ORDER_REJECTED',
              round: parsed.round,
              agentId: parsed.agentId,
              code: 'ILLEGAL_ACTION',
              message: 'that target is no longer reachable',
            }),
          );
          return;
        }
        server.send(message);
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.waitForURL(/\/lobby\/[A-Z0-9]{6}$/);
    await page.getByRole('button', { name: 'Ready Up' }).click();
    await page.waitForURL(/\/match\/[A-Z0-9]{6}$/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Hold' }).click();
    await page.getByRole('button', { name: 'Hold' }).click();
    await page.getByRole('button', { name: 'Submit Orders' }).click();

    await expect(
      page.getByText(
        "Your order couldn't be submitted — that target is no longer reachable. Fix it and resubmit before the timer runs out.",
      ),
    ).toBeVisible();

    // Editable again: Submit Orders is enabled once the draft still holds
    // two actions (the rejected pair is not cleared, matching Retract's own
    // "free editing" model — RETRACT_ORDER decision note in 01-03-SUMMARY.md).
    await expect(page.getByRole('button', { name: 'Submit Orders' })).toBeEnabled();
  });
});
