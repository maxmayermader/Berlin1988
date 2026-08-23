---
phase: 01-playable-skeleton
plan: 03
subsystem: realtime
tags: [partykit, websocket, zod, wire-protocol, fog-of-war, durable-object-alarm, ai-bots]

# Dependency graph
requires:
  - phase: 01-playable-skeleton
    provides: "Plan 01-02's ready-up/countdown/AI-auto-fill/match-start transition — the RoomState this plan turns into a running round loop"
provides:
  - "SUBMIT_ORDER routed through submitOrder(), re-validated against the room's own GameState, with ORDER_ACK/ORDER_REJECTED mirroring the engine's own rejection code"
  - "OPPONENT_COMMITTED derived from pendingOrders key presence only — a locked-in indicator that never carries order content"
  - "round.ts: closeRound()/shouldCloseRound() — the sole resolveRound() call site outside packages/, phase-guarded against double-close"
  - "A server-authoritative 90-second round deadline (timers.ts) as an absolute, write-once-per-round timestamp, expiring into autoHoldMissing rather than forfeit"
  - "Bot seats (bots.ts) that decide from projectView() alone and release through the identical submitOrder() path as humans, padded 1500-4000ms"
  - "apps/party/tests/fog-wire.test.ts — the wire-level fog-of-war scan closing ROADMAP.md's highest-priority Phase 1 research flag"
affects: [01-04, 01-05, 01-06]

# Actuals (#2632)
actuals:
  tokens: 21683
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Time enters purely-functional transition code (timers.ts, round.ts) as an explicit `now` parameter; every Date.now() read lives in room.ts, the app boundary"
    - "The room's single Durable Object alarm slot is coalesced to the earlier of the round deadline and the next pending bot releaseAt, rather than running two timers"
    - "sendResolved/sendCommitted/sendClock extend broadcast.ts as the sole fog chokepoint; resolveRound() and projectView() each have exactly one call site outside packages/"
    - "A RoomState mutation is only re-broadcast when the transition function actually returned a new object (reference check) — the guard against re-sending stale frames on a no-op alarm fire"

key-files:
  created:
    - apps/party/src/round.ts
    - apps/party/src/timers.ts
    - apps/party/tests/round.test.ts
    - apps/party/tests/clock.test.ts
    - apps/party/tests/fog-wire.test.ts
  modified:
    - packages/shared/src/protocol.ts
    - apps/party/src/state.ts
    - apps/party/src/handlers.ts
    - apps/party/src/room.ts
    - apps/party/src/broadcast.ts
    - apps/party/src/bots.ts
    - apps/party/tests/helpers.ts
    - apps/web/lib/socket.ts
    - apps/web/lib/matchStore.ts

key-decisions:
  - "ROUND_RESOLVED carries only { view }, never the raw ResolutionEvent[] the engine's resolveRound() also returns — PlayerView.lastRound is already the fog-filtered log, and a second field for the pipeline's own return value would leak it"
  - "RETRACT_ORDER is not built this phase (planner_assumptions, MATCH-04's monotonic commit-count guarantee honoured instead) — deferred to Plan 01-04's order composer where a player edits freely before pressing Submit"
  - "A RoomState mutation is only re-broadcast to clients when the alarm handler actually produced a new object (reference equality), not on every alarm tick — fixes a stale-alarm re-broadcast bug caught by clock.test.ts's stale-alarm case"

patterns-established:
  - "Wire-level fog scans (fog-wire.test.ts) read expected-secret values from the room's own live GameState rather than a hardcoded fixture, mirroring packages/engine/tests/fog-leak.test.ts one layer up"
  - "AIAgent instances are cached per playerId on the room so particle-filter belief persists across rounds within a match, and are re-derived deterministically from the seed on rehydration after hibernation"

requirements-completed: [MATCH-03]

coverage:
  - id: D1
    description: "A submitted order is held secret in the room's authoritative GameState; other connections see only a per-seat commit count, never order content"
    requirement: "MATCH-03"
    verification:
      - kind: integration
        ref: "apps/party/tests/round.test.ts#a submitted order is held secret; the other connection sees only a commit count"
        status: pass
      - kind: integration
        ref: "apps/party/tests/fog-wire.test.ts#no frame the host connection received across 6 rounds contains another player's agent id, trap id, or decoy id"
        status: pass
    human_judgment: false
  - id: D2
    description: "The round resolves exactly once when every agent commits or the 90-second deadline fires, auto-Holding uncommitted agents, and each connection receives its own projected view"
    requirement: "MATCH-03"
    verification:
      - kind: integration
        ref: "apps/party/tests/round.test.ts#the round resolves once both agents commit, and each connection gets its own projected view"
        status: pass
      - kind: unit
        ref: "apps/party/tests/clock.test.ts (13 tests covering scheduleRoundDeadline/onRoundAlarm/botDelayMs and the double-alarm, no-reset, monotonic-deadline, auto-Hold behaviors)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bot seats decide from projectView() alone and submit through the identical validated path as humans, padded so they are not identifiable by response time"
    requirement: "MATCH-03"
    verification:
      - kind: unit
        ref: "apps/party/tests/fog-wire.test.ts#decideForBotSeats / releaseBotSubmissions (Task 3, unit)"
        status: pass
      - kind: integration
        ref: "apps/party/tests/fog-wire.test.ts#a solo host against three bots reaches round 2 with no human submission after the deadline, and round 3 with exactly one"
        status: pass
    human_judgment: false
  - id: D4
    description: "The wire-level fog-of-war scan proves no opponent agent/trap/decoy/safehouse/cooldown, and no GameState-only key, ever crosses the socket, over 3 room ids and 6 rounds each"
    requirement: "MATCH-03"
    verification:
      - kind: integration
        ref: "apps/party/tests/fog-wire.test.ts (19 tests total, including the exact-key-set checks on OPPONENT_COMMITTED and ROUND_RESOLVED)"
        status: pass
    human_judgment: false

duration: unknown (multi-session; see Issues Encountered)
completed: 2026-08-23
status: complete
---

# Phase 1 Plan 3: Round Loop — Sealed Orders, Server Clock, and Bot Seats Summary

**The full order->seal->resolve->project round loop is live in the PartyKit room: SUBMIT_ORDER validated and held secret through the engine's own submitOrder(), a server-authoritative 90-second absolute-timestamp deadline with auto-Hold, and AI bot seats that decide from projectView() and submit through the identical path as humans — proven wire-safe by a 19-case fog scan over three room ids and six rounds each.**

## Performance

- **Tasks:** 3 completed (Task 1 tracer, Task 2 TDD, Task 3 TDD)
- **Files modified:** 16 (9 in Task 1, 5 in Task 2, 9 in Task 3 including test-fixture touch-ups; see commit stats)
- **Commits:** 5 (1 tracer feat + 2 test/feat TDD pairs)

## Accomplishments

- **Task 1 (tracer):** Wired one new intent through every layer — a player commits an order via `SUBMIT_ORDER`, the room holds it secret in `GameState.pendingOrders`, `OPPONENT_COMMITTED` reports only a count derived from key presence, `closeRound()` is the sole `resolveRound()` call site outside `packages/`, and `sendResolved()` sends each connection its own `projectView()` output. Proven by `round.test.ts`'s sealed-order scan (no frame the guest connection receives at any point contains the host's MOVE target) and per-recipient projection assertion (the two `ROUND_RESOLVED` payloads are not byte-identical).
- **Task 2 (TDD):** `timers.ts` gives every round a server-authoritative, write-once-per-round absolute `deadlineAt` (`now + roundTimerSeconds * 1000`), derived purely from an injected `now` — no `Date.now()` below `room.ts`. `onRoundAlarm` delegates to `closeRound('DEADLINE')` (which first runs `autoHoldMissing`) and is idempotent under duplicate/late alarm fires. A `CLOCK` frame with `paused`/`pausesRemaining` typed as literals (the pause poll isn't built this phase) fans the deadline out room-wide.
- **Task 3 (TDD):** `decideForBotSeats` produces one `AgentOrder` per live agent of every `BOT` seat from `projectView(gameState, seatId)` alone (grep-gated: zero occurrences of `gameState.players` in `bots.ts`), padded 1500-4000ms via the seeded RNG's `botDelayMs`, and `releaseBotSubmissions` drains due submissions through the identical `submitOrder()` path humans use — a rejected bot order is dropped, never force-applied. `AIAgent` instances are cached per `playerId` so belief persists across rounds and are re-derived deterministically from the seed on rehydration.
- **`apps/party/tests/fog-wire.test.ts`** — the phase's highest-priority test (ROADMAP.md's wire-level fog-of-war research flag) — plays a 1-human/3-bot match over three room ids and six rounds each, scanning every literal recorded frame for another player's agent/trap/decoy id, structurally checking no opponent entry can carry a safehouse/agents/traps/decoys/cooldowns field, checking the five `GameState`-only keys never appear on the wire, asserting exact key sets on `OPPONENT_COMMITTED`/`ROUND_RESOLVED`, checking no MOVE/STRIKE target leaks during the order phase, and checking bot-submission timing and cross-room determinism.

## Task Commits

Each task was committed atomically (Tasks 2 and 3 as TDD RED/GREEN pairs):

1. **Task 1: End-to-end "one sealed round"** — `afdfb09` (feat, tracer)
2. **Task 2: The 90-second server clock, auto-Hold, and CLOCK wire frame**
   - `e874adb` (test — failing tests first)
   - `02838a8` (feat — implementation)
3. **Task 3: Bot seats play, and nothing leaks on the wire**
   - `2ecea54` (test — failing tests first)
   - `817ab76` (feat — implementation)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `packages/shared/src/protocol.ts` — `actionSchema`/`agentOrderSchema` (Zod mirror of the `Action` union, annotated `z.ZodType<Action>`), `SUBMIT_ORDER` client message, `ORDER_ACK`/`ORDER_REJECTED`/`OPPONENT_COMMITTED`/`CLOCK`/`ROUND_RESOLVED` server messages
- `apps/party/src/round.ts` — new: `shouldCloseRound`, `closeRound` (the sole `resolveRound()` call site outside `packages/`)
- `apps/party/src/timers.ts` — new: `scheduleRoundDeadline`, `onRoundAlarm`, `botDelayMs`
- `apps/party/src/handlers.ts` — `handleSubmitOrder`, seat-bound and re-validated by the engine, never optimistic-acking
- `apps/party/src/room.ts` — `onAlarm` hook routed by phase; alarm slot coalesced to the earlier of round deadline and next bot `releaseAt`; reference-checked re-broadcast guard
- `apps/party/src/broadcast.ts` — `sendResolved`, `sendCommitted`, `sendClock` extending the fog chokepoint
- `apps/party/src/bots.ts` — `decideForBotSeats`, `releaseBotSubmissions`, `BotSubmission` type
- `apps/party/src/state.ts` — `RoomState.deadlineAt`, `deadlineRound`, `botSubmissions`
- `apps/party/tests/{round,clock,fog-wire}.test.ts` — the three new room-level integration/unit suites (4 + 13 + 19 = 36 tests)
- `apps/party/tests/helpers.ts` — `allFrames`, `playMatch`, `holdSeat`
- `apps/web/lib/socket.ts`, `apps/web/lib/matchStore.ts` — `VIEW`/`ROUND_RESOLVED`/`OPPONENT_COMMITTED`/`ORDER_ACK`/`ORDER_REJECTED`/`CLOCK` wired into the store; `submitOrder` dispatcher

## Decisions Made

- `ROUND_RESOLVED` carries only `{ view }` — the raw `ResolutionEvent[]` `resolveRound()` also returns is never a wire field, since `PlayerView.lastRound` is already the fog-filtered log (plan's tracer `<reversibility>` note).
- `RETRACT_ORDER` (named in `docs/ARCHITECTURE.md` §5 and `01-UI-SPEC.md`) is not built this phase — a source-conflict the plan surfaced and resolved: it appears in no Phase 1 requirement id, and building it would violate the MATCH-04 monotonic-commit-count guarantee. The real need is deferred to Plan 01-04's order composer (free editing of both action slots until Submit is pressed).
- A `RoomState` mutation from the alarm handler is only re-broadcast when it actually produced a new object (reference check), not on every alarm tick — see Issues Encountered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale/duplicate alarm fires re-broadcast identical frames**
- **Found during:** Task 2 (clock.test.ts's stale-alarm case)
- **Issue:** `onRoundAlarm` is idempotent at the `RoomState` level (a duplicate or late alarm returns state unchanged), but the naive room-level wiring re-sent `ROUND_RESOLVED`/`CLOCK` on every alarm tick regardless of whether the state actually changed — a client could receive a duplicate resolution frame for a round that had already resolved.
- **Fix:** `room.ts`'s alarm handler now only re-broadcasts when `onRoundAlarm` returned a reference-distinct `RoomState` from the one passed in.
- **Files modified:** `apps/party/src/room.ts`
- **Verification:** `clock.test.ts`'s stale-alarm no-op case asserts a single broadcast across two alarm fires for the same round.
- **Committed in:** `02838a8` (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — prevents duplicate resolution frames reaching clients. No scope creep.

## Issues Encountered

The prior session confirmed all tests and acceptance criteria green and was preparing to write this SUMMARY.md when the orchestrator's host machine went to sleep (infrastructure interruption, not a logic error). This session re-verified `pnpm typecheck` and `pnpm test` (18 files, 165 tests, all passing) and cross-checked every grep-gated and prose acceptance criterion in `01-03-PLAN.md` against the committed code before writing this file — no rework was needed. Because of the interruption and the more-than-24h gap between Task 1/2's commits (Aug 23 00:xx) and Task 3's commits (Aug 23 14:30), total wall-clock duration is not a meaningful single number and is recorded as "unknown" above rather than guessed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The round loop is live end-to-end: submit -> seal -> resolve -> project, with a server clock and bot seats indistinguishable from humans by timing.
- ROADMAP.md's two highest-risk Phase 1 research flags landing in this plan — wire-level fog of war and hibernation across the 90-second order window — are both closed: `fog-wire.test.ts` is a green, unskipped part of the default `pnpm test` suite, and `RoomState` (including `deadlineAt`/`deadlineRound`/`botSubmissions`) persists to room storage after every mutation and rehydrates in `onStart`.
- Plan 01-04 (order composer UI) can build directly on `apps/web/lib/matchStore.ts`'s `view`/`committed`/`clock`/`orderStatus` fields and the `submitOrder` dispatcher in `socket.ts`.
- `RETRACT_ORDER` is intentionally out of scope this phase (see Decisions Made) — Plan 01-04's composer covers the underlying need via free pre-submit editing.

---
*Phase: 01-playable-skeleton*
*Completed: 2026-08-23*
