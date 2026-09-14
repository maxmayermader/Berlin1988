---
phase: 02-deckbuilder-persistent-loadouts
plan: 04
subsystem: ui
tags: [react, zustand, partykit, playwright, deckbuilder, lobby]

requires:
  - phase: 02-deckbuilder-persistent-loadouts
    plan: 01
    provides: "The SUBMIT_LOADOUT/LOADOUT_ACK/LOADOUT_REJECTED wire pipe, RoomSeat.loadout, setLoadout, and startMatch's per-seat dealing this plan's Save Loadout button sends into"
  - phase: 02-deckbuilder-persistent-loadouts
    plan: 02
    provides: "CardGrid, LegalityMeter, and Deckbuilder's two-column shell — the exact component this plan embeds unchanged in a second host context"
  - phase: 02-deckbuilder-persistent-loadouts
    plan: 03
    provides: "The room's adversarial SUBMIT_LOADOUT contract (phase guards, violation codes, fog scan) this plan's lobby flow relies on without touching apps/party/src/ again"
provides:
  - "The in-lobby deckbuilder embed: an Edit Loadout toggle beside Ready Up, D-05's unconditional SET_READY false on open, and an always-enabled Back to Lobby exit that never sends"
  - "Deckbuilder.tsx widened with optional onSave/onClose/saveStatus/showReadyClearedBanner props — absent, the /deck route's call site renders identically to before this plan"
  - "loadoutStore.ts's lastAcceptedCards + recordAccepted (the room's own echoed cards, separate from the live draft) and loadoutsDiverge() — the input to the lobby's unsaved-changes notice"
  - "apps/web/e2e/lobby.spec.ts — the DECK-05 flow end to end across two browser contexts, the save gate, the copy contract, the divergence notice, and the no-leak proof"
  - "apps/party/tests/loadout.test.ts grown with the literal D-05 room-flow sequence, a countdown-stops case, a concurrent two-seat case, and a leak scan across the whole in-lobby edit dance"
affects: []

actuals:
  tokens: 9800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One presentational component, two host contexts: Deckbuilder's four new props are all optional and unused by the /deck route, so no branch inside Deckbuilder, CardGrid, or LegalityMeter tests which page hosts it"
    - "A ref-gated close-on-accept effect (awaitingSaveCloseRef) rather than a bare saveStatus === 'accepted' check — the latter would re-close a freshly reopened editor on a stale accepted status left over from a previous save or the once-per-join auto-submit"
    - "Divergence as a derived comparison (loadoutsDiverge), never a stored boolean — the room's last accepted cards and the live draft are both already state; whether they differ is a pure computation over the two, exactly like loadoutLegality never storing its own violations"

key-files:
  created:
    - apps/web/e2e/lobby.spec.ts
  modified:
    - "apps/web/app/lobby/[code]/page.tsx"
    - apps/web/components/deck/Deckbuilder.tsx
    - apps/web/lib/loadoutStore.ts
    - apps/web/lib/loadoutStore.test.ts
    - apps/web/lib/socket.ts
    - apps/party/tests/loadout.test.ts

key-decisions:
  - "Task 1's tracer implemented the full feature set in one pass (the ready-cleared banner, both exits, the save/reject gating, and lastAcceptedCards/loadoutsDiverge) rather than a deliberately thin slice deferring the divergence mechanism to Task 3 — Tasks 2 and 3 therefore surfaced as comprehensive characterization of already-correct code, not fresh RED failures, the same outcome Plan 02-02's Task 1 and Plan 02-03's Tasks 2/3 already established as normal for this phase."
  - "The countdown-stop test uses a 2-filled/1-ready fixture (matching apps/party/tests/lobby.test.ts's own precedent), not 2-ready-drops-to-1: at exactly 2 filled seats, un-readying from 2/2 to 1/2 keeps the ratio at the inclusive 50% threshold and correctly does NOT stop the countdown — that surfaced as a genuine, fixed test-authoring mistake before the commit landed, not a production bug."
  - "The 'refused save keeps the editor open' behavior is implemented (the awaitingSaveCloseRef effect only closes on 'accepted', never on 'rejected') but is not exercised by an automated test: D-03's own client-side gate makes an illegal SUBMIT_LOADOUT unreachable through the UI, and reaching a genuine LOADOUT_REJECTED from the browser would require injecting a hostile wire frame the test harness has no sanctioned way to do. Recorded as human_judgment in coverage below, mirroring Plan 02-01's D5 precedent for an analogous untestable negative."

patterns-established:
  - "e2e identity seeding via context.addInitScript writing berlin1988.identity directly, so a two-context lobby test can address a specific seat's row by a fixed codename instead of the randomly generated one"
  - "Listening for a literal inbound wire frame (framereceived, here LOADOUT_ACK) to gate a test's next step, mirroring deck.spec.ts's existing framesent listener for the outbound side — used here to avoid a race between the lobby's once-per-join auto-submit and a divergence assertion"

requirements-completed: [DECK-05]

coverage:
  - id: D1
    description: "A seated player opens the same Deckbuilder component the home page uses, in place inside the lobby page, with no route change and no socket teardown"
    requirement: "DECK-05"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/lobby.spec.ts#open the editor, ready clears for the other player, edit, save, ready again, both reach the match"
        status: pass
    human_judgment: false
  - id: D2
    description: "Opening the editor sends SET_READY false unconditionally (D-05); every other seat observes the ready badge flip off, never inferred from the editing player's own state"
    requirement: "DECK-05"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/lobby.spec.ts#open the editor, ready clears for the other player, edit, save, ready again, both reach the match"
        status: pass
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#the literal D-05 sequence deals the seat its submitted deck at match start"
        status: pass
    human_judgment: false
  - id: D3
    description: "Save Loadout is disabled while the draft is illegal and enabled the moment it is legal again (D-03 in the second host context)"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/lobby.spec.ts#Save Loadout is disabled while the draft is short of ten cards, and enabled once legal again"
        status: pass
    human_judgment: false
  - id: D4
    description: "A saved deck reaches the room and is what a match started afterward actually plays; a seat that never saves plays its last successful submission, not a browser-only draft"
    requirement: "DECK-05"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#a seat that opens the editor and never saves plays the deck it last successfully submitted, not a browser-only draft the room was never told about"
        status: pass
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#two seats each opening, editing, and saving in the same window end up with their own distinct deck; neither clobbers the other"
        status: pass
    human_judgment: false
  - id: D5
    description: "Opening the editor mid-countdown drops a two-seat room's ready ratio below the threshold and stops a running countdown"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#opening the editor mid-countdown drops a two-seat room below the ready threshold and stops it"
        status: pass
    human_judgment: false
  - id: D6
    description: "The ready-cleared banner, the divergence notice, and the save-refused error line render the exact contracted copy, and the divergence notice tracks the room-vs-draft comparison correctly (shown/absent/cleared)"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/lobby.spec.ts#the ready-cleared banner appears even when the seat was never ready, with the contracted copy"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/lobby.spec.ts#the ready-cleared banner never appears on the home-page deckbuilder, which has no ready state to clear"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/lobby.spec.ts#backing out with a changed draft shows the divergence notice; an unchanged back-out shows none; a save clears it"
        status: pass
      - kind: unit
        ref: "apps/web/lib/loadoutStore.test.ts#useLoadoutStore save-status lifecycle (Plan 02-04)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A refused save renders the contracted error line and leaves the editor open so the player can act on it"
    verification: []
    human_judgment: true
    rationale: "The awaitingSaveCloseRef effect in page.tsx only closes the editor on an 'accepted' saveStatus, never on 'rejected' — verifiable by direct code inspection — but D-03's own client-side gate makes an illegal SUBMIT_LOADOUT unreachable through the UI, so no automated test can produce a genuine LOADOUT_REJECTED reply without injecting a hostile wire frame outside this harness's sanctioned tooling. Flagging for human sign-off, mirroring Plan 02-01's D5 precedent for the same class of untestable negative."
  - id: D8
    description: "No frame the non-editing seat receives across the whole D-05 sequence contains the editing seat's card ids, and every ROOM_STATE seat object still has exactly six public keys — no dedicated 'is editing' signal was added"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#no card id appears in any frame the non-editing connection received, and every snapshot seat keeps exactly six keys"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/lobby.spec.ts#the other seat's rendered vocabulary is unchanged across an open-edit-save sequence (no editing indicator leaked)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-29
status: complete
---

# Phase 2 Plan 4: In-Lobby Deckbuilder Summary

**The lobby now embeds the exact same Deckbuilder component the home page uses: opening it clears ready through the existing broadcast (D-05), Save Loadout is gated on live legality and reconciled only by the room's own reply, an always-enabled Back to Lobby exit never loses the local draft, and an "unsaved changes" notice names which deck a match will actually use whenever the two copies disagree — closing DECK-05 and every requirement in Phase 2.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-29T23:13:00Z (approx.)
- **Completed:** 2026-08-29T23:30:00Z
- **Tasks:** 3 completed
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- Embedded `Deckbuilder` inside the lobby page via conditional in-place rendering (no route change, no `useRoomSocket` teardown) — an `Edit Loadout` ghost button beside the existing Ready toggle, gated on the player having a seat.
- Opening the editor sends `SET_READY false` unconditionally, matching 02-UI-SPEC.md's requirement that the ready-cleared banner be shown on every open with no condition of its own — proven from the *other* browser context in `lobby.spec.ts`, never from the editing player's own state.
- Widened `Deckbuilder.tsx` with four optional props (`onSave`, `onClose`, `saveStatus`, `showReadyClearedBanner`); the `/deck` route's call site passes none of them and is byte-for-byte unaffected, verified by the full pre-existing `deck.spec.ts` suite staying green.
- `Save Loadout` is disabled until `loadoutLegality(loadout).isLegal`, shows the `Button` primitive's existing `pending` state while the room's reply is outstanding, and closes the editor only once a ref-gated effect observes an `accepted` reply it itself triggered — never on a stale `accepted` status left over from an earlier save or the once-per-join auto-submit. A rejection leaves the editor open.
- `Back to Lobby` is a second, always-enabled exit that sends nothing — D-01's autosave already persisted the draft locally, so backing out loses no local work, and the room simply keeps its last accepted deck.
- Added `lastAcceptedCards` (the room's own echoed cards from `LOADOUT_ACK`) and the pure `loadoutsDiverge()` comparison to `loadoutStore.ts`; the lobby renders "Your loadout has unsaved changes — this match will use your last saved loadout." whenever the live draft and the room's last accepted deck disagree, and the notice clears the moment a save reconciles them.
- Proved the whole flow, the save gate, the copy contract, the divergence notice, and the no-leak boundary in a new `apps/web/e2e/lobby.spec.ts` (7 specs, two-browser-context where the behavior requires it) and grew `apps/party/tests/loadout.test.ts` with the literal D-05 room sequence, a countdown-stop case, a concurrent two-seat case, and a fog scan across the whole edit dance (5 new integration cases).

## Task Commits

1. **Task 1: End-to-end "change your deck at the table and play it"** - `44934d5` (feat)
2. **Task 2: The save gate, the room's answer, and the deck the match actually uses** - `4a8af67` (test)
3. **Task 3: The copy contract, the divergence notice, and the signal nobody asked for** - `3eed686` (test)

_Tasks 2 and 3 are `tdd="true"`. Task 1's tracer implemented the full feature set — the ready-cleared banner, both exits, save/reject gating, and `lastAcceptedCards`/`loadoutsDiverge` — as a complete, correct first pass rather than a deliberately thin slice deferring the divergence mechanism to a later task. Both TDD tasks' test suites therefore passed immediately against Task 1's code: comprehensive characterization, not skipped RED gates. See "TDD Gate Compliance" below._

## Files Created/Modified

- `apps/web/app/lobby/[code]/page.tsx` - the in-lobby embed: `editingLoadout` state, `openEditor`/`closeEditor`/`handleSave`, the ref-gated close-on-accept effect, the divergence notice
- `apps/web/components/deck/Deckbuilder.tsx` - widened with `onSave`/`onClose`/`saveStatus`/`showReadyClearedBanner`, the ready-cleared banner, the Save Loadout / Back to Lobby controls, the save-refused error line
- `apps/web/lib/loadoutStore.ts` - `lastAcceptedCards`, `recordAccepted`, `loadoutsDiverge`
- `apps/web/lib/loadoutStore.test.ts` - the save-status lifecycle and divergence test suite
- `apps/web/lib/socket.ts` - `LOADOUT_ACK` now calls `recordAccepted` instead of a bare status write
- `apps/web/e2e/lobby.spec.ts` - the new file: the DECK-05 tracer, the save gate, the banner cases, the divergence cases, the no-leak case
- `apps/party/tests/loadout.test.ts` - the D-05 room-flow describe block and the leak-scan describe block (10 new integration cases total)

## Decisions Made

- Followed the plan as specified for D-05, D-03's second-host-context gate, and both planner assumptions (the `Back to Lobby` exit and its divergence notice; the unconditional ready clear paired with the always-shown banner). No new architectural decisions required beyond what `02-CONTEXT.md`/`02-UI-SPEC.md` already locked.
- Chose the ref-gated `awaitingSaveCloseRef` pattern over a bare `saveStatus.state === 'accepted'` check for closing the editor, after recognizing the bare check would re-close a freshly reopened editor on a stale accepted status from an earlier save or the once-per-join auto-submit effect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `apps/web/lib/socket.ts` needed a change the plan's Task 1 file list didn't name**
- **Found during:** Task 1, while wiring `lastAcceptedCards`
- **Issue:** `socket.ts`'s `LOADOUT_ACK` branch called a bare `setSaveStatus({ state: 'accepted' })`, which never records the room's echoed cards — without a change here, `lastAcceptedCards` could never be populated and the divergence notice would be permanently inert.
- **Fix:** Changed the branch to call the new `recordAccepted(message.cards.map(cardId))`.
- **Files modified:** `apps/web/lib/socket.ts`
- **Verification:** `pnpm typecheck` clean; `pnpm test` green; the divergence e2e cases in `lobby.spec.ts` pass.
- **Committed in:** `44934d5` (Task 1)

**2. [Rule 1 - Bug in my own draft] The countdown-stop test's first fixture didn't test what it claimed to**
- **Found during:** Task 2, first run of the countdown-stop case
- **Issue:** The first draft readied both seats in a two-seat room (2/2, ratio 1.0), then un-readied one (1/2, ratio 0.5) and asserted the countdown stopped — but 0.5 is still at the inclusive `>=50%` threshold, so the countdown correctly kept running and the assertion failed.
- **Fix:** Switched to the 2-filled/1-ready fixture `apps/party/tests/lobby.test.ts` already establishes as the threshold case: one ready (0.5, countdown running) un-readying to zero (0/2, below threshold, countdown stops).
- **Files modified:** `apps/party/tests/loadout.test.ts`
- **Verification:** `pnpm vitest run apps/party/tests/loadout.test.ts` — all 27 cases pass.
- **Committed in:** `4a8af67` (Task 2) — caught before the commit, not a separate fix-up.

---

**Total deviations:** 2 (1 auto-fixed blocking issue, 1 test-authoring bug caught and fixed before committing). No scope creep — both are direct, minimal consequences of this plan's own new fields and test fixtures.

## Issues Encountered

**Worktree branch was stale at spawn time (again) — same class of issue documented in every prior plan's summary this phase.** The assigned worktree was checked out at `d8f8877` (Phase 1's PR-merge-squash commit), rather than at the tip of `gsd/phase-02-deckbuilder-persistent-loadouts` (`af2ac81`, with Plans 02-01 through 02-03 already merged in). Verified the worktree branch had zero commits of its own beyond `d8f8877`, a clean working tree, and that the diff against the phase branch tip was exactly the expected Plans 02-01/02-02/02-03 work (no unexpected divergence) before running `git reset --hard gsd/phase-02-deckbuilder-persistent-loadouts` — the sanctioned recovery path for exactly this setup-time condition, not a mid-session destructive operation. `pnpm install` was also required — `node_modules` did not exist in the worktree at spawn time. Flagging once more for the orchestrator as a recurring environment/harness setup issue across every plan in this phase.

## User Setup Required

None - no external service configuration required.

## TDD Gate Compliance

**Task 2** (`tdd="true"`) gate sequence, verified in git log:
1. `test(02-04)` commit `4a8af67` — the full save-status lifecycle, `lastAcceptedCards`/`loadoutsDiverge` suite, the literal D-05 room-flow sequence, the countdown-stop and concurrent-two-seat integration cases, and the e2e save-gate case. All pass immediately against Task 1's already-complete `Deckbuilder`/`page.tsx`/`loadoutStore.ts`.
2. **No `feat(02-04)` commit follows it.** Investigation (re-reading `handleSubmitLoadout`, `setLoadout`, `startMatch`, and the client-side `awaitingSaveCloseRef` effect against every behavior in the task's `<behavior>` list) found no gap: Task 1's tracer already implemented the full contract this task specifies. This is characterization coverage of an already-correct implementation, not a skipped RED gate — the same documented outcome as Plan 02-03's Tasks 2 and 3.

**Task 3** (`tdd="true"`) gate sequence, verified in git log:
1. `test(02-04)` commit `3eed686` — the ready-cleared banner cases (including the not-ready-seat case and the home-page absence case), the divergence-notice cases (shown/absent/cleared), the room-side leak scan, and the browser-side vocabulary-unchanged case. All pass immediately against Task 1's already-complete code.
2. **No `feat(02-04)` commit follows it**, for the same reason: the copy contract, the divergence mechanism, and the absence of any new broadcast were all already correct from Task 1.

One behavior in Task 3's list — a refused save keeping the editor open — is implemented (verified by direct code inspection: the `awaitingSaveCloseRef` effect only closes on `'accepted'`) but is not exercised by an automated test, since D-03's own client-side gate makes an illegal `SUBMIT_LOADOUT` unreachable through the UI. Recorded as `human_judgment: true` in the coverage table above (id D7).

No REFACTOR commits were needed for either task — no cleanup was warranted after either test-only commit.

## Next Phase Readiness

Phase 2 is complete: HOME-04 and DECK-01 through DECK-05 are all delivered and tested. `packages/engine`'s loadout rules, the wire pipe, the card grid and legality meter, the server-side adversarial contract, and now the in-lobby editor form one coherent, fully-tested vertical slice with no known gaps beyond the single human-judgment item (D7) flagged above. No blockers for whatever phase comes next.

---
*Phase: 02-deckbuilder-persistent-loadouts*
*Completed: 2026-08-29*

## Self-Check: PASSED

All 7 created/modified files verified present on disk. All 3 task commits (`44934d5`, `4a8af67`, `3eed686`) verified present in `git log`.
