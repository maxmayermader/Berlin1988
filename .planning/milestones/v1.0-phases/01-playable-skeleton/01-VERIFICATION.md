---
phase: 01-playable-skeleton
verified: 2026-08-27T20:00:00Z
status: human_needed
score: 6/7 must-haves verified
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "A deployed PartyKit room survives Durable Object hibernation across the 90-second idle window and, on waking, resumes the same match (from persisted storage) rather than starting a new one."
    test: "Deploy apps/web to Vercel (pointed at the already-deployed apps/party Cloudflare room), open a match in two browser tabs, leave it idle past the round deadline / well past PartyKit's hibernation window, then send a message from one tab (e.g. submit an order) and confirm both tabs still show the same match (round number, agents, outcome state) rather than a fresh/empty room."
    expected: "Both tabs continue the same match after the idle period — same round, same agent state, no reset — proving RoomState really rehydrates from `this.room.storage` in `onStart` after a real hibernation cycle, not just after an in-process test double."
    why_human: "Cloudflare Durable Object hibernation structurally cannot be triggered in local dev or in an automated test run (01-RESEARCH.md Axis 3) — it only occurs on real Cloudflare infrastructure after a real idle period, and this environment has no Vercel deployment of apps/web to open in a browser at all (no vercel CLI, no linked .vercel project, confirmed absent in this verification pass). The code path (storage.put after every mutation, storage.get in onStart, alarm-based scheduling instead of in-memory timers) is present and plausible, but nothing has actually observed the room complete a real hibernate→wake→resume cycle."
gaps: []
human_verification:
  - test: "Deploy apps/web to Vercel; set NEXT_PUBLIC_PARTYKIT_HOST to the already-deployed berlin1988-party.maxmayermader.partykit.dev host; open a match in two browser tabs; idle past the hibernation window; send a message from one tab."
    expected: "Both tabs resume the same match state after the idle period — no reset, no new room."
    why_human: "Real Cloudflare Durable Object hibernation cannot be triggered locally or in CI; requires a live deployment and a human idling real browser tabs for a real wall-clock period."
  - test: "A person plays a full 14-round-or-earlier match end to end through the deployed stack (deployed apps/web + deployed apps/party), against the AI auto-fill bots, and reports whether bot timing/behavior reads as human-plausible."
    expected: "The match completes to a result screen through the real deployed infrastructure, and the tester's subjective impression of bot pacing/behavior is captured (impressions are the point, not just pass/fail, per 01-06-PLAN.md's own checkpoint framing)."
    why_human: "Explicitly a human-impressions checkpoint, and blocked on the same missing Vercel deployment as above — apps/web has never been deployed in this environment (no vercel CLI, no linked project, no GitHub-integration auto-deploy found)."
---

# Phase 1: Playable Skeleton Verification Report

**Phase Goal:** A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete 14-round match and see a result — minimal styling, one default loadout, no extras.
**Verified:** 2026-08-27
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All five truths below are the ROADMAP.md Success Criteria for Phase 1. A sixth truth is carried forward from 01-06-PLAN.md's `must_haves` (a plan-level phase-gate item, not itself a numbered roadmap Success Criterion, but explicitly declared by 01-06-SUMMARY.md as blocking phase close).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a game from the home page and receive a unique join code, and a second browser can enter that code and land in the same lobby. | VERIFIED | `apps/party/tests/join.test.ts` (2 tests, independently re-run, pass); `apps/web/e2e/home.spec.ts` (3 tests, independently re-run against a real `pnpm dev` stack in a real Chromium browser — two-context create/join, unknown-code error copy, placeholder copy). All pass. |
| 2 | Players can ready up with every seat's ready state visible to everyone; once ≥50% of filled seats are ready a countdown starts and the match begins, with empty seats auto-filled by AI. | VERIFIED | `apps/party/tests/lobby.test.ts` (14 tests: ready visibility, ≥50% threshold, recompute-on-every-event, cancel-below-threshold) and `apps/party/tests/botfill.test.ts` (15 tests: ascending empty-seat fill, human seats never overwritten, single `createMatch()` call site, per-connection `PlayerView` fan-out) — independently re-run, pass. `apps/web/e2e/result.spec.ts` and `match.spec.ts` exercise the real "Ready Up alone → match starts against 3 bots" path end to end in a real browser. |
| 3 | Each round a player sees the Berlin node-graph map, assigns 2 actions per agent, and submits — while every other player sees only a locked-in indicator plus a live "N of M submitted" count and countdown, never order content. | VERIFIED | `apps/party/tests/fog-wire.test.ts` (19 tests, independently re-run, pass) proves no opponent agent/trap/decoy/safehouse/cooldown or order content crosses the wire over 3 room ids × 6 rounds, and that `OPPONENT_COMMITTED` carries only a count. `apps/web/e2e/match.spec.ts` (click-composed and keyboard-composed two-action orders, both reaching a real server ack) and `apps/web/e2e/resolution.spec.ts` ("a second context sees the count rise by exactly one... renders four locked-in slots") — independently re-run in a real two-browser-context Playwright run, pass. |
| 4 | After the round deadline, resolution is presented as a step-through report in fixed priority order, and play advances to the next round. | VERIFIED | `apps/web/lib/stepThrough.test.ts` (44 tests: order fidelity against 3 real `resolveRound()` seeds, never merges/reorders/reveals ahead) and `apps/web/e2e/resolution.spec.ts` ("watch the count and clock while composing, then step through the resolved round") — independently re-run, pass. `da8e771` (order status/draft reset on `ROUND_RESOLVED`) confirmed present so round 2+ is actually composable, not just round 1. |
| 5 | A full 14-round match reaches a result screen that names the winner and explains which condition ended it. | VERIFIED (locally) | `apps/web/lib/result.ts` (14 tests) + `packages/engine/tests/score-symmetry.test.ts` (3 tests) + `apps/party/tests/result.test.ts` (5 tests, incl. "reaches `RoomState.phase` ENDED... no alarm remains scheduled") — independently re-run, all pass. `apps/web/e2e/result.spec.ts` independently re-run against a real local PartyKit room and Next.js dev server: a seeded match plays to completion against 3 AI bots and reaches a result screen with a winner headline matching `/wins?$/` and one of the three exact contracted outcome sentences. This proves the *client and local-server* halves of Success Criterion 5 conclusively. It does **not** prove the match completes through the deployed production stack (see Truth 6) — no Vercel deployment of `apps/web` exists in this environment to test against. |
| 6 (plan-level, not a numbered roadmap SC) | A deployed room survives Durable Object hibernation and resumes the same match; a human plays a full match through the deployed stack and confirms bot timing reads as human-plausible. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code pattern is present and consistent with what hibernation-survival requires (`RoomState` persisted via `this.room.storage.put` after every mutation, rehydrated via `this.room.storage.get` in `onStart`, alarm scheduling via `this.room.storage.setAlarm`/`deleteAlarm` rather than in-memory timers — confirmed by direct code read of `apps/party/src/room.ts`). `apps/party` is independently confirmed deployed and live (`partykit.json` present; SUMMARY's live join-code mint against `berlin1988-party.maxmayermader.partykit.dev` is consistent with this). But no Vercel deployment of `apps/web` exists in this environment (`command -v vercel` → not found; no `.vercel/` directory; no `vercel.json` — independently confirmed) so the actual hibernate→wake→resume cycle and the human full-match playthrough have never been exercised. This is 01-06-PLAN.md's own declared `checkpoint:human-verify gate="blocking"` (Task 3), explicitly unresolved per 01-06-SUMMARY.md. |

**Score:** 6/7 truths verified (5 of 5 roadmap Success Criteria fully verified; 1 plan-level phase-gate truth present and wired but behaviorally unexercised)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/protocol.ts` | Zod wire protocol, single source of truth | VERIFIED | Present; all message types (`CREATE`/`JOIN`/`SET_READY`/`SUBMIT_ORDER`/`VIEW`/`ROUND_RESOLVED`/etc.) confirmed via test suite usage |
| `apps/party/src/room.ts`, `state.ts`, `handlers.ts`, `broadcast.ts`, `bots.ts`, `round.ts`, `timers.ts`, `settings.ts`, `auth.ts`, `joinCode.ts` | Authoritative match host | VERIFIED | All present on disk; exercised by 91 party-level unit/integration tests (join, joinCode, lobby, botfill, clock, round, fog-wire, result), independently re-run, all pass |
| `apps/web/app/page.tsx`, `lobby/[code]/page.tsx`, `match/[code]/page.tsx` | Home, lobby, match routes | VERIFIED | All present; match page confirmed (by direct read) to route ORDERS → RESOLUTION → ResultScreen sub-states correctly off `matchSubState` and `view.outcome` |
| `apps/web/components/board/*` | Inline-SVG Berlin board | VERIFIED | `Board.tsx`, `MapNode.tsx`, `MapEdge.tsx`, `AgentToken.tsx`, `TargetOverlay.tsx` present; `board.test.ts` (10 tests) pass; e2e agent-token/fog assertions pass |
| `apps/web/components/orders/*` | Two-action order composer | VERIFIED | `OrderComposer.tsx`, `ActionSlot.tsx`, `AgentSwitcher.tsx` present; `orderDraft.ts`/`orderDraft.test.ts` (9 tests) prove a third action is structurally unrepresentable |
| `apps/web/components/hud/*` | Submitted count, clock, locked-in row | VERIFIED | `SubmittedCount.tsx`, `RoundClock.tsx`, `LockedInRow.tsx` present; e2e proves count rises by exactly one per submission and never reveals order content |
| `apps/web/components/resolution/*` | Step-through resolution report | VERIFIED | `StepThrough.tsx`, `ResolutionEventRow.tsx` present; `stepThrough.test.ts` (44 tests) and e2e both pass |
| `apps/web/lib/result.ts`, `components/result/ResultScreen.tsx` | Terminal result screen | VERIFIED | Both present; direct code read confirms no `@berlin/engine` import, no `.sort()`/`Math.max`/`Math.min` — pure copy over `MatchOutcome`; wired into `match/[code]/page.tsx` on `view.outcome !== null` |
| `apps/party/partykit.json` | Deployment config | VERIFIED (present) | Present and well-formed; deployment itself confirmed separately (see key links) |
| Vercel deployment of `apps/web` | Deployed client for Task 3 checkpoint | MISSING | No `vercel` CLI, no `.vercel/` directory, no `vercel.json` found in this environment — independently confirmed absent |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Home page (Create/Join) | `apps/party` `_new` mint endpoint / room JOIN | HTTP mint then WebSocket connect | WIRED | `home.spec.ts` e2e passes against real stack |
| Lobby page | Match page | `router.push` on `snapshot.phase === 'IN_GAME'` | WIRED | Confirmed by direct code read of `lobby/[code]/page.tsx`; exercised by every e2e spec that reaches the board |
| `OrderComposer` | `legalOrders()` (predictive) → `SUBMIT_ORDER` → room `submitOrder()` (authoritative) | `lib/orderDraft.ts` + `lib/socket.ts` | WIRED | `orderDraft.test.ts`, `round.test.ts`, e2e reject/accept cases all pass |
| Room `ROUND_RESOLVED` | `StepThrough` component | `uiStore.enterResolution` on socket message | WIRED | `resolution.spec.ts` e2e passes; `stepThrough.test.ts` order-fidelity tests pass against real `resolveRound()` output |
| `view.outcome` | `ResultScreen` | conditional render in `match/[code]/page.tsx` | WIRED | Direct code read confirms `view.outcome !== null` branch renders `ResultScreen` exclusively, replacing composer/step-through; `result.spec.ts` e2e proves this in a real browser against a real deployed-locally PartyKit room |
| `apps/party` room state | Durable Object storage (hibernation survival) | `storage.put`/`storage.get` in `onStart`/mutation tail | PRESENT, NOT WIRE-PROVEN AGAINST REAL HIBERNATION | Code pattern present and consistent with the documented requirement; only `apps/party`-side deploy verification (live join-code mint) has been done — the actual hibernate/wake cycle against a real idle Durable Object, from a deployed `apps/web` client, is unverified (see Truth 6) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOME-01 | 01-01 | Create a new game, receive a unique join code | SATISFIED | `join.test.ts`, `joinCode.test.ts`, `home.spec.ts` — independently re-run, pass |
| HOME-02 | 01-01 | Join a game by entering a join code | SATISFIED | `home.spec.ts` two-browser case — independently re-run, pass |
| LOBBY-03 | 01-02 | Ready state visible to everyone | SATISFIED | `lobby.test.ts` — independently re-run, pass |
| LOBBY-04 | 01-02 | ≥50% ready countdown | SATISFIED | `lobby.test.ts` — independently re-run, pass |
| LOBBY-05 | 01-02 | Solo host + AI auto-fill | SATISFIED | `botfill.test.ts`, `result.spec.ts`/`match.spec.ts` e2e (solo Ready Up → 3-bot match) — independently re-run, pass |
| MATCH-01 | 01-04 | Board renders node-graph map as primary play surface | SATISFIED | `board.test.ts`, `match.spec.ts` e2e — independently re-run, pass |
| MATCH-02 | 01-04 | Two actions per agent against the map | SATISFIED | `orderDraft.test.ts`, `match.spec.ts` e2e (click + keyboard) — independently re-run, pass |
| MATCH-03 | 01-03 | Locked-in indicator only, never order content | SATISFIED | `fog-wire.test.ts` (19 tests, wire-level scan) — independently re-run, pass |
| MATCH-04 | 01-05 | Live "N of M submitted" + countdown timer | SATISFIED | `clock.test.ts`, `resolution.spec.ts` e2e (two-context count assertion) — independently re-run, pass |
| MATCH-05 | 01-05 | Step-through resolution in fixed priority order | SATISFIED | `stepThrough.test.ts` (44 tests) — independently re-run, pass |
| MATCH-08 | 01-06 | Result screen names winner + condition | SATISFIED (client/local-server); deployed-stack playthrough unverified | `result.test.ts` (unit), `result.test.ts` (party integration), `result.spec.ts` (e2e) — independently re-run, all pass. Task 3's deployed-stack human checkpoint is the only unverified sliver (see Truth 6 / human verification). |

No orphaned requirements found — all 11 requirement IDs the phase declares (`HOME-01, HOME-02, LOBBY-03, LOBBY-04, LOBBY-05, MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05, MATCH-08`) exactly match ROADMAP.md's Phase 1 requirements list and REQUIREMENTS.md's traceability table (all marked `Complete`).

### Anti-Patterns Found

None. Scanned `apps/web/lib`, `apps/web/components`, `apps/web/app`, `apps/party/src`, `packages/engine/src`, `packages/shared/src` for `TBD`/`FIXME`/`XXX`, `TODO`/`HACK`/`PLACEHOLDER`, and "not yet implemented"/"coming soon" phrasing. Zero debt markers found. The only "placeholder" string matches are a legitimate HTML `placeholder` input attribute and two prose comments explicitly describing the *absence* of a placeholder concept (fog-as-absence design, not a stub).

### Behavioral Spot-Checks / Full Suite Execution

Both the unit/integration suite and the e2e suite were independently re-run in this verification pass (not taken on SUMMARY.md's word):

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit/integration suite | `pnpm test` | 264/264 tests passed, 26 files, 7.85s | PASS |
| Typecheck | `pnpm typecheck` | Clean, exit 0 | PASS |
| Full e2e suite (real browser, real local stack) | `pnpm test:e2e` | 10/10 passed, 55.5s, incl. full seeded 3-bot match to a result screen | PASS |

These numbers match what 01-06-SUMMARY.md claimed (264/264, 10/10) — independently reproduced, not merely trusted.

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` files exist in this project and no plan/SUMMARY references probe-based verification. Skipped.

### Human Verification Required

See frontmatter `human_verification`. Both items stem from 01-06-PLAN.md's Task 3, a `checkpoint:human-verify gate="blocking"` that 01-06-SUMMARY.md explicitly could not attempt in this environment (no Vercel deployment of `apps/web` exists — independently confirmed absent: no `vercel` CLI, no `.vercel/` directory, no `vercel.json`).

1. **Hibernation survival across a real deployed room**
   **Test:** Deploy `apps/web` to Vercel (pointed at the already-live `berlin1988-party.maxmayermader.partykit.dev`), open a match in two browser tabs, idle well past the round deadline / hibernation window, then send a message from one tab.
   **Expected:** Both tabs continue the same match — no reset, no fresh room — proving the Durable Object actually rehydrated from storage after a real hibernation cycle.
   **Why human:** Cloudflare Durable Object hibernation cannot be triggered in local dev or any automated test in this environment; it requires a live deployment and a real idle wall-clock period.

2. **A full human-played match through the deployed stack**
   **Test:** A person plays a full match end to end through the deployed `apps/web` + `apps/party` stack against the AI auto-fill bots.
   **Expected:** The match completes to a result screen through production infrastructure, and the player's subjective read on bot timing/pacing is captured.
   **Why human:** Explicitly framed by 01-06-PLAN.md as an impressions checkpoint ("impressions are the point, not just pass or fail"), and blocked on the same missing Vercel deployment.

**Prerequisite for both:** the user needs to deploy `apps/web` to Vercel and set `NEXT_PUBLIC_PARTYKIT_HOST=berlin1988-party.maxmayermader.partykit.dev`, per 01-06-SUMMARY.md's "User Setup Required" section — independently confirmed as a genuine, currently-unmet prerequisite (not a claim taken on trust).

### Gaps Summary

No functional gaps. All five ROADMAP.md Success Criteria for Phase 1 are independently verified true in the codebase: create/join by code, ready-up with visible state and ≥50% countdown with AI auto-fill, the board + two-action composer + locked-in/count/timer fog boundary, the step-through resolution report advancing rounds, and a full local match reaching a named-winner result screen. The full automated suite (264 unit/integration tests + 10 e2e tests, including one that plays an entire seeded match against three bots to a result screen in a real browser) was re-run from scratch in this verification pass and passed without exception. `pnpm typecheck` is clean. No debt markers or stub patterns were found in any file this phase touched.

The one open item is a deliberately-scoped, already-flagged, already-accepted gap: 01-06-PLAN.md's Task 3 blocking human-verify checkpoint (Durable Object hibernation survival across a real Cloudflare deploy, plus a human-played full match through that deployed stack) could not be attempted because no Vercel deployment of `apps/web` exists yet in any environment this project has touched — confirmed independently in this pass (no `vercel` CLI, no linked project, no `vercel.json`). The underlying code pattern for hibernation survival (storage-persisted `RoomState`, rehydration in `onStart`, alarm-based scheduling) is present and consistent with what's required, and `apps/party` itself is already confirmed deployed and live — but the actual hibernate→wake→resume cycle, and the human "does this feel like a real match" judgment, have genuinely never been exercised. This is not a functional defect in the shipped code; it is an unexercised, deployment-gated verification step that requires a human to first deploy `apps/web` and then personally run the two checkpoint procedures.

---

*Verified: 2026-08-27*
*Verifier: Claude (gsd-verifier)*
