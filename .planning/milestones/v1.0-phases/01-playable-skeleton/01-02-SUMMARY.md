---
phase: 01-playable-skeleton
plan: 02
subsystem: realtime-lobby
tags: [partykit, zod, zustand, vitest, ai-bots, seeded-rng]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Party room scaffold, join-code create/join flow, RoomState/LobbySnapshot shapes, sendLobby broadcast chokepoint"
provides:
  - "Full ready-up lobby: SET_READY/SET_CODENAME wire messages, per-seat pure transitions, seatFor identity resolution"
  - "Server-authoritative >=50%-ready countdown with recompute-on-every-event and idempotent start/cancel"
  - "AI auto-fill (fillEmptySeatsWithBots) at the LOADOUT->IN_GAME transition, HANDLER-tier, seeded-RNG personality"
  - "buildMatchConfig + startMatch — the single createMatch() call site, PHANTOM loadout assignment, idempotence guard"
  - "sendViews — the per-connection projectView() chokepoint, one VIEW frame per recipient"
  - "apps/web/lib/seatRows.ts pure view model for badges, AI labelling, row order, and countdown visibility"
affects: [01-03, 01-04, 01-05, 01-06]

# Actuals (#2632)
actuals:
  tokens: 15005
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Pure-transition lobby state (state.ts) with a recompute-on-every-event countdown, not just on the triggering event type"
    - "Per-recipient projectView chokepoint (sendViews), grep-gated to exactly one file, mirroring the sendLobby fan-out chokepoint from 01-01"
    - "Client seat-list rules live in a pure lib/ module (seatRows.ts) asserted on values, never in a component test — no React DOM testing stack in this phase"

key-files:
  created:
    - apps/party/src/bots.ts
    - apps/party/src/settings.ts
    - apps/party/tests/botfill.test.ts
    - apps/party/tests/lobby.test.ts
    - apps/web/lib/seatRows.ts
    - apps/web/lib/seatRows.test.ts
    - apps/web/lib/matchStore.ts
    - apps/web/components/lobby/SeatList.tsx
    - apps/web/components/lobby/CodenameEditor.tsx
    - apps/web/components/lobby/ReadyCountdown.tsx
  modified:
    - apps/party/src/state.ts
    - apps/party/src/handlers.ts
    - apps/party/src/room.ts
    - apps/party/src/broadcast.ts
    - packages/shared/src/protocol.ts
    - apps/web/app/lobby/[code]/page.tsx
    - apps/party/tests/helpers.ts

key-decisions:
  - "10-second countdown duration — planner's choice, no source artifact specifies one (LOBBY-04 unresolved edge, recorded in <planner_assumptions>)"
  - "Bot difficulty fixed at HANDLER for the whole phase (D-07) — no difficulty UI, mid-tier to avoid a trivially-beatable first impression"
  - "Ghost/Katja personality duel-dominance imbalance (CONCERNS.md) is a known playtest caveat, explicitly left uncompensated in the personality draw"
  - "startMatch is idempotent — returns state unchanged once phase leaves LOBBY/LOADOUT — so a double-fired alarm can never reset an in-progress match"

patterns-established:
  - "recomputeCountdown called from every lobby-mutating handler tail (join, ready-toggle, codename), not only ready toggles"
  - "seatRows.ts as the single source of seat-row derivation — SeatList.tsx renders it, never re-derives"

requirements-completed: [LOBBY-03, LOBBY-04, LOBBY-05]

coverage:
  - id: D1
    description: "Every seat's ready state is visible to every connected player, toggled via SET_READY with identity resolved server-side from the connection binding"
    requirement: LOBBY-03
    verification:
      - kind: unit
        ref: "apps/party/tests/lobby.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A countdown to start begins automatically at >=50% of filled seats ready (inclusive threshold), recomputed after every join/ready/codename event, and cancels if the ratio drops back below 50%"
    requirement: LOBBY-04
    verification:
      - kind: unit
        ref: "apps/party/tests/lobby.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "AI opponents fill every empty seat at match start (never eagerly), skipping any seat a human has already claimed, at fixed HANDLER difficulty with a seeded-RNG personality draw"
    requirement: LOBBY-05
    verification:
      - kind: unit
        ref: "apps/party/tests/botfill.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The single LOADOUT->IN_GAME transition: buildMatchConfig locks D-01 through D-04 as literal MatchSettings values, startMatch is the sole createMatch() call site and is idempotent, and every seat receives the PHANTOM loadout"
    verification:
      - kind: unit
        ref: "apps/party/tests/botfill.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The moment the match starts, every connection receives its own PlayerView via a per-recipient projectView() call — no two connections receive the same payload, and each VIEW's self.id matches the sending connection's own seat"
    verification:
      - kind: unit
        ref: "apps/party/tests/botfill.test.ts#each connection receives its own VIEW frame after startMatch, and no two are byte-identical"
        status: pass
    human_judgment: false
  - id: D6
    description: "Seat list badges, open-seat/AI labelling, row order, and countdown visibility are derived by a pure view model (seatRows.ts) and asserted on values, with no React component-testing stack introduced"
    verification:
      - kind: unit
        ref: "apps/web/lib/seatRows.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-21
status: complete
---

# Phase 01 Plan 02: Ready-Up Lobby, Countdown, and AI Auto-Fill Summary

**Server-authoritative ready-up lobby with a recompute-on-every-event >=50% countdown, AI auto-fill at match start via a seeded-RNG HANDLER-tier bot draw, and the single `startMatch`/`createMatch` transition that assigns every seat the PHANTOM loadout and fans out per-connection `PlayerView`s through a grep-gated `projectView` chokepoint.**

## Performance

- **Duration:** 25 min (spanning a session interruption; active work time)
- **Started:** 2026-08-20T19:39:00-07:00
- **Completed:** 2026-08-21T19:51:03-07:00
- **Tasks:** 3 (Task 1 tracer, Task 2 TDD, Task 3 TDD)
- **Files modified:** 17

## Accomplishments
- End-to-end ready-up: `SET_READY`/`SET_CODENAME` wire messages, pure `setReady`/`setCodename` transitions in `state.ts`, `seatFor`-resolved identity so no client can toggle another seat
- Server-authoritative >=50% countdown (`readyRatio`, `countdownShouldRun`, `recomputeCountdown`) recomputed on join, ready-toggle, and codename events alike, with a 10-second window and clean cancellation below threshold
- `apps/web/lib/seatRows.ts` pure view model — badge text, AI labelling, stable row order, and countdown visibility asserted on values with zero component tests
- AI auto-fill (`fillEmptySeatsWithBots`) assigns empty seats ascending, skips any human-claimed seat, fixed `HANDLER` difficulty, seeded-RNG personality
- `buildMatchConfig`/`startMatch` in `apps/party/src/settings.ts` — the single `createMatch()` call site, idempotent against a double-fired alarm, assigns `PHANTOM` to every player
- `sendViews` in `broadcast.ts` — the per-connection `projectView()` chokepoint, one `VIEW` frame per recipient, resolved from that connection's own seat binding

## Task Commits

Each task was committed atomically (TDD tasks show test-then-feat pairs):

1. **Task 1: End-to-end "ready up" — one toggle, visible to everyone** - `17ea0ff` (feat)
2. **Task 2: The >=50% ready threshold and its countdown** - `30b6e3f` (test, RED) → `10b7f31` (feat, GREEN)
3. **Task 3: AI auto-fill and the single match-start transition** - `8d6f06f` (test, RED) → `a9008b4` (feat, GREEN)

**Plan metadata:** committed alongside this SUMMARY.

_Note: TDD tasks (2 and 3) have paired test/feat commits per the plan's TDD gate requirement._

## Files Created/Modified
- `apps/party/src/bots.ts` - `fillEmptySeatsWithBots`, `BOT_DIFFICULTY` — ascending-order bot fill, skips occupied seats, seeded personality draw
- `apps/party/src/settings.ts` - `buildMatchConfig`, `startMatch` — the sole `createMatch()` call site and the LOADOUT→IN_GAME transition
- `apps/party/src/state.ts` - `setReady`, `setCodename`, `readyRatio`, `countdownShouldRun`, `recomputeCountdown`, `startsAt`/`gameState` fields on `RoomState`
- `apps/party/src/handlers.ts` - `handleSetReady`, `handleSetCodename`, recompute wired into join/ready/codename handler tails
- `apps/party/src/room.ts` - `onAlarm` wires countdown expiry to `startMatch` then `sendLobby` + `sendViews`
- `apps/party/src/broadcast.ts` - `sendViews` — per-connection `projectView` chokepoint
- `packages/shared/src/protocol.ts` - `SET_READY`/`SET_CODENAME` client messages, `VIEW` server message, `startsAt` on `LobbySnapshot`
- `apps/web/lib/seatRows.ts` - `seatRows`, `readySummary`, `shouldShowCountdown`, `READY_BADGE_TEXT`, `NOT_READY_BADGE_TEXT`
- `apps/web/lib/matchStore.ts` - Zustand store holding `LobbySnapshot` and, from match start, one `PlayerView`
- `apps/web/components/lobby/SeatList.tsx` - renders `seatRows()` output; open/AI/ready labelling
- `apps/web/components/lobby/ReadyCountdown.tsx` - renders remaining seconds from server `startsAt`, never a local drifting timer
- `apps/web/components/lobby/CodenameEditor.tsx` - 20-char capped rename, disabled once ready
- `apps/web/app/lobby/[code]/page.tsx` - wires `SeatList` + Ready Up button to the socket
- `apps/party/tests/lobby.test.ts`, `apps/party/tests/botfill.test.ts`, `apps/web/lib/seatRows.test.ts` - new test suites
- `apps/party/tests/helpers.ts` - `triggerAlarm` now calls the real `onAlarm` (no longer a no-op stub)

## Decisions Made
- 10-second countdown duration: planner's choice; no source artifact specifies a value (recorded in the plan's `<planner_assumptions>` for LOBBY-04)
- Bot difficulty fixed at `HANDLER` for the entire phase (D-07): no difficulty picker UI, avoids both a trivially-easy first bot and the documented Katja/Ghost imbalance being compounded by a lowest-tier draw
- `startMatch` idempotence guard (returns state unchanged outside LOBBY/LOADOUT) is the safety net against a double-fired Durable Object alarm

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a tautological test assertion for PHANTOM-loadout coverage**
- **Found during:** Task 3 acceptance-criteria verification (resumed session)
- **Issue:** The GREEN test `after startMatch, phase is IN_GAME, gameState is non-null, and every loadout is PHANTOM` compared `player.loadout` to `started.gameState!.players[player.id]!.loadout` — since `player` IS that same object, the assertion was `expect(x).toEqual(x)`, always true regardless of what the loadout actually held. The behavior row explicitly requires proving every loadout equals `PHANTOM`.
- **Fix:** Changed the assertion to `expect(player.loadout).toEqual([...PHANTOM])`, importing `PHANTOM` from `@berlin/engine`.
- **Files modified:** `apps/party/tests/botfill.test.ts`
- **Verification:** Re-ran `pnpm vitest run apps/party/tests/botfill.test.ts` — still passes, now against the real value.
- **Committed in:** `a9008b4` (Task 3 GREEN commit)

**2. [Rule 1 - Bug] Fixed VIEW-frame identity test that didn't assert against the sender's own seat**
- **Found during:** Task 3 acceptance-criteria verification (resumed session)
- **Issue:** The acceptance criteria require asserting each connection's `VIEW.view.self.id` matches its *own* seat. The test only asserted the host's and guest's `self.id` differed from each other — two views could both be wrong (e.g. both equal to some third value, or swapped) and this test would still pass.
- **Fix:** Captured each connection's own `playerId` from its `JOINED` response and asserted `hostView.view.self.id === hostPlayerId` and `guestView.view.self.id === guestPlayerId`, in addition to the existing cross-connection distinctness checks.
- **Files modified:** `apps/party/tests/botfill.test.ts`
- **Verification:** Re-ran the full suite — 129/129 passing.
- **Committed in:** `a9008b4` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — test assertions that didn't verify their claimed behavior)
**Impact on plan:** Both fixes tighten test coverage to match the plan's literal acceptance criteria; no production code changed as a result, no scope creep.

## Issues Encountered
A prior executor session was interrupted by an infrastructure/session-quota error immediately after Task 3's implementation was written but before it was verified or committed. This session verified the uncommitted work against Task 3's literal acceptance criteria rather than assuming test-suite-green implied correctness, found the two tautological/incomplete assertions above, fixed them, then committed Task 3 as a single atomic `feat(01-02)` commit on top of the four commits that had already landed.

One grep-based acceptance criterion (`grep -rl 'projectView' apps/party/src` lists exactly one file) technically returns two matches: `apps/party/src/broadcast.ts` (the actual chokepoint, satisfying the intent) and `apps/party/src/CLAUDE.md` (pre-existing project documentation, unrelated to and unmodified by this plan, whose "Rules" section describes the chokepoint convention in prose). The source-code invariant — exactly one `.ts` file calls `projectView` — holds; the doc-file match is a false positive of the literal grep pattern against a non-code file that predates this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01-03 (board rendering + per-connection `PlayerView` consumption) can build directly on `matchStore.ts`'s `view` field and the `VIEW` wire message landed here.
- A solo host can now reach `IN_GAME` against three HANDLER-tier bots, or four humans can start together with zero bots — both paths call `createMatch` exactly once via `startMatch`.
- No blockers identified for Wave 3.

---
*Phase: 01-playable-skeleton*
*Completed: 2026-08-21*

## Self-Check: PASSED

All created files found on disk; all 6 commits (17ea0ff, 30b6e3f, 10b7f31, 8d6f06f, a9008b4, 3086168) verified present in git log.
