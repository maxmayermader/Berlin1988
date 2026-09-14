---
phase: 03-open-lobbies-host-control-table-talk
plan: 04
subsystem: realtime
tags: [partykit, durable-object, ai-opponents, disconnect-handling, seat-control, reconnect]

# Dependency graph
requires:
  - phase: 03-open-lobbies-host-control-table-talk
    provides: seat-count control, kick, live directory updates, chat (03-01/02/03)
provides:
  - "RoomSeat.controlledBy — the 'who is driving this seat right now' field, distinct from kind ('how did it originate')"
  - "apps/party/src/readout.ts aiReadoutFor() — the public '{Name} the {Title}' string exposed on the wire"
  - "Disconnect grace-period scheduling folded into the room's single Durable Object alarm slot (apps/party/src/timers.ts)"
  - "apps/party/src/bots.ts takeOverSeat/reclaimSeat — the reversible human<->AI control flip, with the submitOrder overwrite-race purge"
affects: [phase-04-round-loop-ui, any-future-phase-touching-room-lobby-state-or-bot-decisioning]

# Actuals (#2632)
actuals:
  tokens: 20553
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "controlledBy vs kind split: kind is origin (never changes), controlledBy is current driver (flips both ways)"
    - "Grace-period/takeover timers are purely additive candidates in the room's single alarmTarget() Math.min — never write deadlineAt/deadlineRound"
    - "A takeover/reclaim guard only engages the T-03-23 protection when a takeover actually fired this tick, so it never breaks a caller that invokes onAlarm without advancing wall-clock time to a scheduled target"

key-files:
  created:
    - apps/party/src/readout.ts
    - apps/party/tests/disconnect.test.ts
    - apps/party/tests/takeover.test.ts
  modified:
    - apps/party/src/state.ts
    - apps/party/src/bots.ts
    - apps/party/src/timers.ts
    - apps/party/src/room.ts
    - apps/party/src/handlers.ts
    - apps/party/src/settings.ts
    - packages/shared/src/protocol.ts
    - apps/web/lib/seatRows.ts
    - apps/web/components/lobby/SeatList.tsx
    - apps/party/tests/helpers.ts
    - apps/party/tests/botfill.test.ts
    - apps/party/tests/loadout.test.ts
    - apps/party/tests/chat.test.ts
    - apps/party/tests/clock.test.ts
    - apps/party/tests/directory.test.ts
    - apps/party/tests/fog-wire.test.ts
    - apps/party/tests/kick.test.ts
    - apps/party/tests/lobby.test.ts
    - apps/party/tests/seatcount.test.ts
    - apps/web/lib/seatRows.test.ts

key-decisions:
  - "personality.title already existed in packages/ai (verified before writing code, per 03-RESEARCH.md Pitfall 4) — no title field/lookup was added, contradicting 03-CONTEXT.md D-09's stale claim."
  - "aiReadoutFor lives in its own module (apps/party/src/readout.ts) rather than state.ts or bots.ts specifically to avoid an import cycle."
  - "SeatRow.isAi was fully retired in favor of a three-value status discriminant (NORMAL/RECONNECTING/AI) with strict precedence, making 'never two states at once' structurally true."
  - "DISCONNECT_GRACE_MS = 20_000, planner's choice per D-07 (no source artifact specifies a value) — a lower bound on the real reclaim window per 03-RESEARCH.md Assumption A1, not an exact one."
  - "The T-03-23 guard (grace expiry must not be mistaken for countdown expiry) only engages when a takeover actually fired this tick — a bare startsAt-vs-now comparison on every LOBBY/LOADOUT alarm would have broken the many pre-existing tests that call triggerAlarm() without first advancing wall-clock time to startsAt."
  - "takeOverSeat/reclaimSeat each return exactly one object literal (or the input by reference when a no-op) — no separate awaited steps between the control flip, the botSubmissions purge, and the grace-entry clear."

patterns-established:
  - "Pure control-mode split (kind vs controlledBy) as the seam for any future reversible-ownership feature on a RoomSeat."
  - "Every new Durable-Object timer candidate is folded into the single alarmTarget() Math.min rather than given its own scheduling path."

requirements-completed: [LOBBY-06, LOBBY-07]

coverage:
  - id: D1
    description: "Every AI-controlled seat (lobby-fill bot or mid-match takeover) renders '{Personality} the {Title}' in place of the bare AI badge"
    requirement: LOBBY-07
    verification:
      - kind: unit
        ref: "apps/party/tests/botfill.test.ts#apps/party/src/readout.ts aiReadoutFor"
        status: pass
      - kind: unit
        ref: "apps/web/lib/seatRows.test.ts#seatRows sets status AI and a non-null aiReadout"
        status: pass
      - kind: human
        ref: "Task 4 checkpoint step A"
        status: pass
    human_judgment: true
    rationale: "Actual rendered typography/color in a real browser (03-UI-SPEC.md's Label-size, no-accent-color rule, and the Marek Doležal diacritic) was Task 4's checkpoint step A — approved by the user."
  - id: D2
    description: "A dropped player's seat shows 'Reconnecting…' — never AI — until a takeover actually fires, and a quick return is silent (no AI ever involved)"
    requirement: LOBBY-06
    verification:
      - kind: unit
        ref: "apps/party/tests/disconnect.test.ts#onClose for a bound connection schedules a grace entry..."
        status: pass
      - kind: unit
        ref: "apps/party/tests/disconnect.test.ts#a JOIN carrying the seats token while a grace entry exists..."
        status: pass
      - kind: human
        ref: "Task 4 checkpoint step B"
        status: pass
    human_judgment: true
    rationale: "Real onClose timing, real partysocket auto-reconnect, and hibernation between close and alarm cannot be reproduced by the in-process harness (03-RESEARCH.md Pitfall 3) — Task 4 checkpoint step B, approved by the user."
  - id: D3
    description: "A grace period expiring hands the seat to a named AI and the match continues; a later reconnect (even post-takeover) reclaims the seat and purges any stale bot order so it can never overwrite the returning player's fresh submission"
    requirement: LOBBY-06
    verification:
      - kind: unit
        ref: "apps/party/tests/takeover.test.ts#the overwrite-race regression"
        status: pass
      - kind: unit
        ref: "apps/party/tests/takeover.test.ts#a grace entry expiring during IN_GAME triggers takeOverSeat..."
        status: pass
      - kind: human
        ref: "Task 4 checkpoint step C"
        status: pass
    human_judgment: true
    rationale: "Task 4 checkpoint step C required a real cross-browser takeover + reclaim + order-submission flow — approved by the user, who confirmed the returning player's own order (not the bot's) was applied."
  - id: D4
    description: "The disconnect grace period never writes deadlineAt/deadlineRound or otherwise touches the round clock (P-3-03)"
    verification:
      - kind: unit
        ref: "apps/party/tests/disconnect.test.ts#scheduling a grace entry during a live round leaves deadlineAt and deadlineRound strictly unchanged"
        status: pass
      - kind: human
        ref: "Task 4 checkpoint step D"
        status: pass
    human_judgment: true
    rationale: "Task 4 checkpoint step D was the human half of this prohibition's verification (03-04-PLAN.md's own Prohibitions section marked both halves flagged-unverified until a human watched the live countdown) — approved by the user, who confirmed the countdown never paused, jumped, or reset."

# Metrics
duration: single session, spanning one checkpoint (Tasks 1-3, then Task 4 human verification)
completed: 2026-09-02
status: complete
---

# Phase 03 Plan 04: Every AI seat gets a name, and a dropped player never loses their seat — Summary

**`controlledBy` splits seat origin from current driver; a 20s disconnect grace period folds into the room's single alarm slot; a reconnect purges any stale bot order before it can overwrite a fresh human submission — verified end to end across real browser sessions.**

## Performance

- **Duration:** single session, spanning one checkpoint (Tasks 1-3 executed back to back, then Task 4's cross-browser human verification)
- **Tasks:** 4 of 4 complete (Task 4, a `checkpoint:human-verify` gate, was approved by the user across all 12 verification steps)
- **Files modified:** 20 (3 new, 17 modified — see `key-files` above)

## Accomplishments

- Every AI-controlled seat — a lobby-fill bot or a mid-match takeover — now exposes a public `aiReadout` string ("Katja Reiner the Ghost", etc.) formatted from `@berlin/ai`'s existing `Personality.name`/`.title`; no title field was added anywhere, since it already existed (03-RESEARCH.md Pitfall 4 was correct, 03-CONTEXT.md D-09 was stale).
- `RoomSeat.controlledBy` is now the single source of truth for "who's driving this seat" (`'HUMAN' | 'AI' | null`), fully decoupled from `kind` ("how did it originate"). `decideForBotSeats`'s loop guard, `aiReadoutFor`, and the seat-row `status` discriminant all read `controlledBy`.
- A dropped connection (`onClose`) now schedules a 20-second grace window folded additively into the room's single Durable Object alarm slot (`alarmTarget()`, replacing the IN_GAME-only `roundAlarmTarget`) — the round clock is provably untouched (P-3-03).
- A grace expiry hands the seat to a named AI (`takeOverSeat`) with the seat's `playerId`/`token`/`codename`/`kind` preserved byte-for-byte (the crucial divergence from `fillEmptySeatsWithBots`, which mints a fresh identity for a never-occupied chair).
- A token-matched reconnect — before or after a takeover — reclaims the seat (`reclaimSeat`), atomically purging every queued bot submission for that seat in the same returned state. This closes a verified engine fact: `packages/engine/src/submitOrder.ts` has no "already committed" rejection, so an un-purged stale bot order would silently overwrite the returning player's fresh order.
- `apps/web/lib/seatRows.ts`'s `isAi` boolean was fully retired for a three-value `status` discriminant (`'NORMAL' | 'RECONNECTING' | 'AI'`) with strict precedence, making "a seat is never shown in two states at once" structurally true rather than a rendering convention.

## Task Commits

Each task was committed atomically:

1. **Task 1: Every AI seat gets a name** — `779e12e` (feat)
2. **Task 2: A dropped player shows as Reconnecting, and a quick return is silent** — `0057f40` (feat)
3. **Task 3: The bot takes the wheel, and gives it back** — `c451464` (feat)

Task 4 (checkpoint:human-verify, `gate="blocking"`) — the user walked through all 12 verification steps (readout typography/diacritic, grace-period silent reclaim, mid-match takeover + reclaim + real order submission, and the untouched live clock) in their own browser sessions and approved. No code changes; the checkpoint itself is the deliverable for this task.

_Note: this is a `tdd="true"` task-level plan (each task's tests were extended/written alongside the implementation, not committed as separate RED/GREEN commits — no plan-level `type: tdd` gate applies here)._

## Files Created/Modified

- `apps/party/src/readout.ts` — new; `aiReadoutFor(seat)` formats the public "{Name} the {Title}" string
- `apps/party/src/state.ts` — `RoomSeat.controlledBy`, `RoomState.disconnectedSeats`, `DisconnectedSeat`, `DISCONNECT_GRACE_MS`; `toSnapshot` emits `aiReadout`/`disconnected`
- `apps/party/src/bots.ts` — `takeOverSeat`, `reclaimSeat`; `decideForBotSeats`'s filter now reads `controlledBy`
- `apps/party/src/timers.ts` — `scheduleDisconnectGrace`, `clearDisconnectGrace`, `expiredGraceSeats`
- `apps/party/src/room.ts` — real `onClose` handler; private `roundAlarmTarget` replaced by `alarmTarget` (every phase); `onAlarm` folds expired grace entries through `takeOverSeat` in both LOBBY/LOADOUT and IN_GAME branches; JOIN branch sends the reclaiming connection its own `VIEW`
- `apps/party/src/handlers.ts` — `handleCreate`/`handleJoin` set `controlledBy: 'HUMAN'`; token-rebind branch clears grace entries and runs `reclaimSeat` when the matched seat was AI-controlled
- `apps/party/src/settings.ts` — audit comment confirming `buildMatchConfig` deliberately still reads `seat.kind`, not `controlledBy`
- `packages/shared/src/protocol.ts` — `lobbySeatSchema` gains `aiReadout`/`disconnected`
- `apps/web/lib/seatRows.ts` — `SeatRow.status` discriminant + `aiReadout`, `RECONNECTING_LABEL`; `isAi` removed
- `apps/web/components/lobby/SeatList.tsx` — renders the AI readout / Reconnecting label per `status`
- `apps/party/tests/disconnect.test.ts`, `apps/party/tests/takeover.test.ts` — new test suites
- `apps/party/tests/helpers.ts` — `TestConnection.close()`, `TestRoom.alarmAt()` (see Deviations)
- Several pre-existing party test fixtures updated for the new required `RoomState.disconnectedSeats`/`RoomSeat.controlledBy` fields (see Deviations)

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test harness needed a way to simulate a closed connection and inspect the raw alarm target**
- **Found during:** Task 2, writing `disconnect.test.ts`
- **Issue:** `apps/party/tests/helpers.ts`'s `TestConnection`/`TestRoom` had no way to invoke the room's `onClose` handler or read the fake Durable Object storage's exact scheduled alarm time (only a boolean `alarmScheduled()` existed) — both are required to test `onClose` and the multi-candidate `alarmTarget()` Math.min.
- **Fix:** Added `TestConnection.close()` (invokes `instance.onClose?.()` after removing the connection from the room's connection set, mirroring real PartyKit behavior) and `TestRoom.alarmAt()` (exposes the raw `FakeStorage.getAlarm()` value).
- **Files modified:** `apps/party/tests/helpers.ts`
- **Verification:** Exercised by every `disconnect.test.ts` and `takeover.test.ts` case.
- **Committed in:** `0057f40` (Task 2)

**2. [Rule 1 - Bug] `RoomState.disconnectedSeats` being a new required field broke every hand-built `RoomState` fixture across the existing party test suite**
- **Found during:** Task 2, `pnpm typecheck` after adding the field
- **Issue:** `apps/party/tests/{botfill,chat,clock,directory,fog-wire,kick,lobby,seatcount}.test.ts` each construct `RoomState` object literals directly; none included the new required `disconnectedSeats` field.
- **Fix:** Added `disconnectedSeats: []` to each fixture.
- **Files modified:** the eight files above.
- **Verification:** `pnpm typecheck` exits 0; full suite green.
- **Committed in:** `0057f40` (Task 2)

**3. [Rule 1 - Bug] `RoomSeat extends LobbySeat` inherited the new wire-only `aiReadout`/`disconnected` fields, which `RoomSeat` must never store directly**
- **Found during:** Task 1, `pnpm typecheck` after extending `lobbySeatSchema`
- **Issue:** `RoomSeat`'s original `interface RoomSeat extends LobbySeat` picked up `aiReadout`/`disconnected` as required stored fields, forcing every seat-construction call site (`openSeat`, test fixtures) to fabricate values for two fields that are meant to be derived fresh by `toSnapshot()`, never stored.
- **Fix:** Changed to `interface RoomSeat extends Omit<LobbySeat, 'aiReadout' | 'disconnected'>`.
- **Files modified:** `apps/party/src/state.ts`
- **Verification:** `pnpm typecheck` exits 0.
- **Committed in:** `779e12e` (Task 1)

**4. [Rule 1 - Bug] `packages/ai`'s `Personality.title` is already "The X" — a literal `${name} the ${title}` join produced "Katja Reiner the The Ghost"**
- **Found during:** Task 1, first test run of `aiReadoutFor`
- **Issue:** The plan's action text describes joining name + the word "the" + title, but `title` already includes its own leading "The " (e.g. `'The Ghost'`), producing a doubled "the The" when concatenated naively.
- **Fix:** Strip the leading `"The "` from `title` before joining, producing the exact strings 03-UI-SPEC.md lists.
- **Files modified:** `apps/party/src/readout.ts`
- **Verification:** `aiReadoutFor` for KATJA asserted literally equal to `'Katja Reiner the Ghost'`.
- **Committed in:** `779e12e` (Task 1)

**5. [Rule 1 - Bug] A naive `startsAt`-vs-`now` guard for T-03-23 broke ~30 pre-existing tests that call `triggerAlarm()` without advancing wall-clock time**
- **Found during:** Task 3, full-suite run after wiring `applyExpiredTakeovers` into `onAlarm`'s LOBBY/LOADOUT branch
- **Issue:** The plan's literal guard ("only attempt startMatch when `startsAt` is not null and not in the future") is correct in isolation, but the existing party test suite calls `room.triggerAlarm()` immediately after `SET_READY` without advancing fake/real time to the scheduled `startsAt` — an implicit convention this guard broke everywhere at once (38 failing tests: `result.test.ts`, `round.test.ts`, `seatcount.test.ts`, and others).
- **Fix:** The guard now only engages when a takeover actually fired this tick (`takeoverFired && (startsAt === null || startsAt > now)`), preserving the exact pre-existing unconditional-`startMatch` behavior on every call where no grace expired — which is every existing test's scenario — while still protecting the new disconnect-during-LOBBY case Task 3 introduces.
- **Files modified:** `apps/party/src/room.ts`
- **Verification:** Full `pnpm test` suite green (486 tests); the new LOBBY-phase-takeover test in `takeover.test.ts` still exercises the intended guard.
- **Committed in:** `c451464` (Task 3)

**6. [Rule 1 - Bug] `apps/party/tests/loadout.test.ts` had two hardcoded "6 public seat keys" assertions that broke once `lobbySeatSchema` gained two fields**
- **Found during:** Task 1, full-suite run
- **Issue:** Two pre-existing tests asserted `Object.keys(seat)).toHaveLength(6)` to prove no loadout/personality field leaks onto the wire — a correct assertion under the old 6-field schema, now stale at 8 fields (`aiReadout`, `disconnected` added).
- **Fix:** Updated both assertions to `toHaveLength(8)` with a comment explaining the count changed and what the test still actually guards against.
- **Files modified:** `apps/party/tests/loadout.test.ts`
- **Verification:** Both tests pass; still fail if a `loadout`/`personality` field were ever added to the schema.
- **Committed in:** `779e12e` (Task 1)

---

**Total deviations:** 6 auto-fixed (5 Rule 1 - bug, 1 Rule 3 - blocking)
**Impact on plan:** All six were necessary consequences of the plan's own schema/behavior changes propagating through existing code and tests, or missing test infrastructure required to exercise the new behavior. No scope creep — no feature beyond what Tasks 1-3 specify was added.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required. Both dev servers (`apps/web` on `http://localhost:3000`, `apps/party` on `http://127.0.0.1:1999`) were started in the background for Task 4's checkpoint and are already running.

## Next Phase Readiness

All four tasks are complete. Tasks 1-3 are committed and green across the full 486-test suite (`pnpm test`, `pnpm typecheck`), reconfirmed clean at plan close-out. Task 4's `checkpoint:human-verify` gate — real cross-browser disconnect/reconnect/takeover/reclaim testing that the in-process harness cannot reproduce (03-RESEARCH.md Pitfall 3 / Assumption A1) — was approved by the user across all 12 verification steps. LOBBY-06 and LOBBY-07 are both satisfied end to end, and this was the final plan of Phase 3 (Open Lobbies, Host Control & Table Talk) — the phase itself is now complete.

---
*Phase: 03-open-lobbies-host-control-table-talk*
*Status: complete — all 4 tasks done, Task 4 checkpoint approved by the user*

## Self-Check: PASSED

All 10 created/modified files listed above and all 3 task commit hashes (`779e12e`, `0057f40`, `c451464`) were verified present on disk / in `git log`.
