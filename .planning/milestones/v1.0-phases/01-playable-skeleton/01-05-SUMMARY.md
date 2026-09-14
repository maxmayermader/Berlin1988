---
phase: 01-playable-skeleton
plan: 05
subsystem: ui
tags: [react, zustand, motion, playwright, vitest, resolution-replay]

# Dependency graph
requires:
  - phase: 01-playable-skeleton/01-04
    provides: matchStore (committed, clock, view), uiStore (selectedAgentId, draftByAgent, connectionStatus), format.ts (truncateCodename, orderRejectionText), the match route and OrderComposer
provides:
  - "apps/web/lib/clock.ts — secondsRemaining/clockLabel/isUrgent/URGENT_THRESHOLD_SECONDS, pure and clamped at zero"
  - "apps/web/lib/stepThrough.ts — the click-to-advance reveal reducer (initialReveal/advance/revealedEvents/isComplete)"
  - "apps/web/lib/format.ts eventText — exhaustive prose for every ResolutionEvent member, shared by the visual row and its screen-reader text"
  - "apps/web/lib/uiStore.ts matchSubState + reveal — the ORDERS/RESOLUTION round sub-state, entered by socket.ts on ROUND_RESOLVED"
  - "the order-phase HUD: SubmittedCount, RoundClock, LockedInRow"
  - "the resolution report: StepThrough (D-05/D-06), ResolutionEventRow"
affects: [01-06, result-screen, replay-viewer]

# Actuals (#2632)
actuals:
  tokens: 13500
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Reveal-by-slice: the step-through's unrevealed tail is never returned by the reducer, so it can never reach the DOM under any styling — concealment-by-CSS is structurally impossible, not just avoided by convention."
    - "Static-source TDD for component-only deltas: where no React component-testing stack exists, a vitest test reads the component's source and asserts on the same substrings the plan's own grep-based acceptance criteria check (useReducedMotion, the #2563EB accent, truncateCodename), giving genuine RED-before-GREEN for otherwise untestable UI conventions."
    - "matchSubState as an explicit UI flag, not derived from view.phase — resolveRound's upkeep already advances the server's round counter before the client ever sees the resolved log, so 'still showing the report' has to live in uiStore rather than be inferred from the view."

key-files:
  created:
    - apps/web/lib/clock.ts
    - apps/web/lib/clock.test.ts
    - apps/web/lib/stepThrough.ts
    - apps/web/lib/stepThrough.test.ts
    - apps/web/lib/format.test.ts
    - apps/web/components/hud/SubmittedCount.tsx
    - apps/web/components/hud/RoundClock.tsx
    - apps/web/components/hud/LockedInRow.tsx
    - apps/web/components/resolution/StepThrough.tsx
    - apps/web/components/resolution/ResolutionEventRow.tsx
    - apps/web/e2e/resolution.spec.ts
  modified:
    - apps/web/lib/format.ts
    - apps/web/lib/uiStore.ts
    - apps/web/lib/socket.ts
    - apps/web/app/match/[code]/page.tsx

key-decisions:
  - "The resolved round number shown by the report (\"Round N resolved\", \"Continue to Round N+1\") is read from the log's own ROUND_START event, not from view.round — resolveRound's upkeep increments state.round before the client sees it, so view.round already points at the next round by the time ROUND_RESOLVED arrives."
  - "SubmittedCount and LockedInRow take a PlayerView prop but read matchStore.committed internally rather than accepting a committed/total prop directly, closing off any caller path that could pass a locally-adjusted number (this plan's explicit prohibition)."
  - "ResolutionEventRow renders text only, not the <li> wrapper — StepThrough.tsx owns the list item so the per-row motion.li transition (D-06) attaches directly to it, and a stable index key means an already-revealed row never remounts or re-animates on a later click."

patterns-established:
  - "Static-source assertions as the RED half of TDD for UI-only conventions with no component-test stack — documented above."

requirements-completed: [MATCH-04, MATCH-05]

coverage:
  - id: D1
    description: "Order-phase HUD: live 'N of M submitted' count and a countdown to the server's deadline, both server-derived; a fixed four-slot locked-in row with truncated codenames."
    requirement: "MATCH-04"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/resolution.spec.ts#watch the count and clock while composing, then step through the resolved round"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/resolution.spec.ts#a second context sees the count rise by exactly one when the first submits, and renders four locked-in slots"
        status: pass
      - kind: unit
        ref: "apps/web/lib/clock.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Click-to-advance resolution report: replays PlayerView.lastRound one event at a time, in the engine's exact fixed order, never merging or revealing ahead; per-row motion, suppressed under prefers-reduced-motion."
    requirement: "MATCH-05"
    verification:
      - kind: unit
        ref: "apps/web/lib/stepThrough.test.ts (44 tests — order fidelity over 3 real resolveRound() seeds, empty-step, 1-and-16 synthetic logs, consecutive same-agent/same-node events, eventText exhaustiveness)"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/resolution.spec.ts#reduced motion: every revealed row is still visible and readable"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 5: HUD and Resolution Step-Through Summary

**"N of M submitted" plus a server-derived countdown while composing, and a click-to-advance resolution report that replays the engine's own eleven-step log one row at a time, per-row motion gated on prefers-reduced-motion.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-26T22:12:00Z (resumed after an infrastructure interruption — no commits had landed for this plan)
- **Completed:** 2026-08-27T05:30:00Z
- **Tasks:** 3 (Task 1 tracer, Task 2 TDD, Task 3 TDD)
- **Files modified:** 15 (11 created, 4 modified)

## Accomplishments
- The order-phase HUD (`SubmittedCount`, `RoundClock`, `LockedInRow`) reads exclusively from `matchStore` — never a locally-incremented counter, never an optimistic mark on the local Submit click.
- The resolution report (`StepThrough`, `ResolutionEventRow`) reveals by array slice; the unrevealed tail is never returned by `stepThrough.ts`'s reducer, so it can never reach the DOM under any CSS state.
- `format.ts`'s `eventText` is an exhaustive switch over all 24 `ResolutionEvent` members with no default branch — a new event type is a compile error, not a blank row — and every nulled-by-fog field (`AMBUSH_TRIGGERED.victimAgentId`, `STRIKE_FIRED.agentId`, `AGENT_BURNED.agentId`, `DOSSIER_TAKEN.agentId`, `EXTRACTION.agentId`) renders as prose about an unnamed agent.
- Order fidelity is proven against a *real* `resolveRound()`/`projectView()` call over three seeds — the revealed slice is index-for-index, reference-identical to `view.lastRound` — not just against a fixture.

## Task Commits

1. **Task 1: End-to-end "submit, watch, then step through the round" (tracer)** — `2f3e778` (feat)
2. **Task 2: The step-through never reorders, merges, or runs ahead** — `0474272` (test, RED) → `d4848f9` (feat, GREEN)
3. **Task 3: The count only climbs and the clock only falls** — `3adc848` (test, RED) → `cd88e3b` (feat, GREEN)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/web/lib/clock.ts` — `secondsRemaining`, `clockLabel`, `isUrgent`, `URGENT_THRESHOLD_SECONDS`
- `apps/web/lib/clock.test.ts` — boundary (`deadline`, `deadline+5000`), null-deadline, D-04's 90-second reading, label formatting, urgency threshold
- `apps/web/lib/stepThrough.ts` — the reveal reducer: `initialReveal`, `advance`, `revealedEvents`, `isComplete`, `REVEALED_AT_START`
- `apps/web/lib/stepThrough.test.ts` — 44 tests: order fidelity over 3 real match seeds, empty-step, 1-and-16 synthetic logs, consecutive-event rows, `eventText` exhaustiveness, reducer-has-no-content-inspection assertion, and the reduced-motion static-source check
- `apps/web/lib/format.ts` — added `eventText`, an exhaustive `ResolutionEvent` switch
- `apps/web/lib/format.test.ts` — `truncateCodename` at 19/20/21 chars, plus static-source checks for `RoundClock`'s urgency accent and `LockedInRow`'s use of the shared truncation helper
- `apps/web/lib/uiStore.ts` — added `matchSubState` ('ORDERS' | 'RESOLUTION') and `reveal`, plus `enterResolution`/`advanceReveal`/`exitResolution`
- `apps/web/lib/socket.ts` — `ROUND_RESOLVED` now also calls `uiStore.enterResolution(message.view.lastRound)`
- `apps/web/components/hud/SubmittedCount.tsx` — "N of M submitted" from live seats' committed status
- `apps/web/components/hud/RoundClock.tsx` — countdown recomputed from `deadlineAt` on an interval; `#2563EB` accent under 10s
- `apps/web/components/hud/LockedInRow.tsx` — fixed four-slot row, `truncateCodename`, bot "AI" badge, locked-in checkmark
- `apps/web/components/resolution/StepThrough.tsx` — click-to-advance report; `motion.li` per-row transition gated on `useReducedMotion()`
- `apps/web/components/resolution/ResolutionEventRow.tsx` — one row's text, via `eventText`
- `apps/web/app/match/[code]/page.tsx` — the two round sub-states: board+composer+HUD, or board+report
- `apps/web/e2e/resolution.spec.ts` — 3 tests: full submit→watch→step-through→continue loop, reduced-motion, and the two-context count/four-slot case

## Decisions Made
- The resolved round number the report displays is read from the log's own `ROUND_START` event rather than `view.round`, because `resolveRound`'s upkeep already advances the server's round counter before the client sees the resolved log.
- `SubmittedCount`/`LockedInRow` take `view` but read `matchStore.committed` internally rather than accepting a `committed`/`total` prop, closing off any path for a caller to pass a locally-adjusted number.
- Where no React component-testing stack exists this phase, the two remaining Task 3 UI-only deltas (RoundClock's urgency accent, LockedInRow's use of `truncateCodename`) were proven RED-before-GREEN with vitest tests that read the component's source — the same substrings the plan's own grep-based acceptance criteria check — rather than skipped as "untestable."

## Deviations from Plan

None — plan executed as written. One resume-specific note: this session picked up mid-plan after an infrastructure interruption (the orchestrator's machine slept) with `clock.ts`/`clock.test.ts` already drafted but uncommitted and zero commits landed for 01-05. Both files were verified against Task 1/Task 3's literal behavior list (not assumed correct from existence) before being folded into the commit sequence — `clock.ts` into Task 1's tracer commit (it implements exactly what Task 1's action text specifies), `clock.test.ts` into Task 3's RED commit (its assertions already cover 100% of Task 3's clock-related `<behavior>` rows).

## Issues Encountered
- The first E2E run failed on `page.getByRole('button', { name: 'Next' })` resolving to two elements — the Next.js dev-tools floating button also matches that accessible name in dev mode. Fixed with `{ name: 'Next', exact: true }`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 Success Criteria 3 and 4 are complete for the client, end to end: a player can watch a round fill and resolve, and read exactly what happened in the engine's own order.
- Plan 01-06 can build the result screen against `view.outcome` — `StepThrough`'s `isFinal` prop already suppresses the "Continue" prompt when `view.outcome !== null`, leaving the hook point for 01-06 to take over.
- No blockers.

---
*Phase: 01-playable-skeleton*
*Completed: 2026-08-26*

## Self-Check: PASSED

All 11 created/modified source files and the SUMMARY itself verified present on disk. All 5 task commits (`2f3e778`, `0474272`, `d4848f9`, `3adc848`, `cd88e3b`) verified present in `git log`.
