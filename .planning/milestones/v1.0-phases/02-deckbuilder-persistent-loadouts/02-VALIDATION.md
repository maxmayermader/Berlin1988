---
phase: 02
slug: deckbuilder-persistent-loadouts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-27
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 (unit/integration), Playwright (e2e) |
| **Config file** | `vitest.config.ts` (root); `apps/web/playwright.config.ts` |
| **Quick run command** | `pnpm test -- loadout` (filename substring filter), or `pnpm vitest run apps/web/lib/loadoutStore.test.ts` once created |
| **Full suite command** | `pnpm test` (root `vitest run`) |
| **Estimated runtime** | ~10s (matches Phase 1's 264-test baseline plus this phase's additions) |

---

## Sampling Rate

- **After every task commit:** Run the touched test file directly, e.g. `pnpm vitest run <file>`
- **After every plan wave:** Run `pnpm test` (full suite) + `pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite green, plus `pnpm test:e2e` for the new `/deck` route and lobby-editing flows
- **Max feedback latency:** ~10 seconds (unit/integration); ~60s for e2e

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-TBD | TBD | TBD | HOME-04 | — | `/deck` route renders and is reachable from home page | e2e | `pnpm test:e2e -- home` | ❌ W0 | ⬜ pending |
| 02-01-TBD | TBD | TBD | DECK-01 | — | All `ALL_CARDS` render grouped by icon; add/remove updates the draft | unit | `pnpm vitest run apps/web/lib/loadoutStore.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-TBD | TBD | TBD | DECK-02 | — | Live legality meter recomputes after every change, matching `validateLoadout()` directly | unit | `pnpm vitest run apps/web/lib/loadoutStore.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-TBD | TBD | TBD | DECK-03 | — | Loading a starter preset overwrites the draft entirely (reset, not merge — D-02) | unit | `pnpm vitest run apps/web/lib/loadoutStore.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-TBD | TBD | TBD | DECK-04 | — | Loadout survives page refresh / fresh session, no login | unit | `pnpm vitest run apps/web/lib/loadoutStore.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-TBD | TBD | TBD | DECK-05 | T-2-01 / T-2-02 | Opening lobby deckbuilder clears ready state; submit is seat-scoped server-side; match uses the submitted loadout | integration + e2e | `pnpm vitest run apps/party/tests/loadout.test.ts`; `pnpm test:e2e -- lobby` | ❌ W0 | ⬜ pending |
| 02-01-TBD | TBD | TBD | (regression) | — | `startMatch` assigns per-seat loadouts, not blanket `PHANTOM` | integration | `pnpm vitest run apps/party/tests/botfill.test.ts` | ✅ exists, needs edit | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are TBD — the planner fills these in against actual plan/wave/task numbers.*

---

## Wave 0 Requirements

- [ ] `apps/web/lib/loadoutStore.test.ts` — covers DECK-01, DECK-02, DECK-03, DECK-04 (store hydration, derive-legality, preset overwrite)
- [ ] `apps/party/tests/loadout.test.ts` — covers DECK-05's server side: `handleSubmitLoadout`, `RoomSeat.loadout`, `startMatch` reading per-seat loadouts instead of `PHANTOM`
- [ ] `apps/web/e2e/deck.spec.ts` — covers HOME-04 end to end (navigate from home, build a loadout, refresh, it persists)
- [ ] Extend `apps/web/e2e/home.spec.ts` or add `apps/web/e2e/lobby.spec.ts` — covers DECK-05's in-lobby flow (open editor → ready clears → save → ready again → match starts with that loadout)
- [ ] Edit (not create) `apps/party/tests/botfill.test.ts` — its current "every loadout is PHANTOM" assertion (`apps/party/tests/botfill.test.ts:117-122`) will fail once the hardcode is removed and must be updated as part of this phase's own work, not left as an accidental regression

---

## Manual-Only Verifications

*None — all phase behaviors (DECK-01 through DECK-05, HOME-04) have automated unit/integration/e2e coverage planned above.*

---

## Security Notes (from research)

- `SUBMIT_LOADOUT` must resolve the acting seat via `seatFor(state, connectionId)` — never a `playerId`/seat index in the message body (same pattern as `SET_READY`/`SUBMIT_ORDER`).
- Client-side legality gating (D-03: disable submit until legal) is UX only. The server must independently re-run `validateLoadout()` on arrival — never trust the wire payload's legality.
- `localStorage` tampering (editing `berlin1988.loadout` directly) is not a meaningful threat in this single-player-owns-their-own-deck context — the server-side re-check at `SUBMIT_LOADOUT`/`startMatch` is the actual trust boundary.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
