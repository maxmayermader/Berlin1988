---
phase: 02-deckbuilder-persistent-loadouts
plan: 03
subsystem: testing
tags: [partykit, vitest, security, loadout, fog-of-war]

requires:
  - phase: 02-deckbuilder-persistent-loadouts
    provides: "Plan 02-01's SUBMIT_LOADOUT wire pipe: handleSubmitLoadout, RoomSeat.loadout, setLoadout, and startMatch's per-seat loadout dealing with a PHANTOM fallback"
provides:
  - "apps/party/tests/loadout.test.ts grown from Plan 02-01's 3-case happy-path file into a 21-case adversarial contract: cross-seat isolation, all five validateLoadout violation codes, every room-phase guard (LOBBY/LOADOUT accept, IN_GAME/ENDED refuse), the wire-bound-vs-rules-bound payload distinction, and a literal-frame fog scan across a full lobby-to-match-start sequence"
  - "apps/party/tests/botfill.test.ts gains startMatch's defense-in-depth fallback case (a stored deck that stops validating between submission and match start) and a passivesAvailable/consumablePassivesIn consistency check across bots and humans"
  - "Confirmation, not new code: Plan 02-01's handleSubmitLoadout/setLoadout/startMatch already satisfy every case this plan adds — zero production code changes were required"
affects: [02-04-in-lobby-editor]

actuals:
  tokens: 6247
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Violation fixtures built by filtering ALL_CARDS/STARTER_LOADOUTS at test-run time (four cards sharing an icon, every card of one sector, the ten most expensive cards) rather than hand-typing card ids, so a future content/balance edit can't silently invalidate a fixture without also changing the violation it's meant to trigger"
    - "Rejection text asserted against an in-test validateLoadout() call, never a restated string, so the room's wording can never drift from the engine's own"
    - "A room-phase case with no production trigger yet (RoomPhase.LOADOUT) is reached by mutating the room's own live RoomState object returned by roomState() directly, the same object room.ts holds — not a fixture, not a new test-harness setter"
    - "A wire-leak scan picks two starter presets with zero card-id overlap (PHANTOM/OLIGARCH) specifically so a matched substring can only mean a leak, never both seats legitimately holding the same card"

key-files:
  created: []
  modified:
    - apps/party/tests/loadout.test.ts
    - apps/party/tests/botfill.test.ts

key-decisions:
  - "No changes to apps/party/src/handlers.ts or apps/party/src/state.ts were made. Plan 02-01's implementation was already built defensively against this exact adversarial contract (seatFor-only resolution, phase guards admitting LOBBY/LOADOUT, engine-authoritative rejection leaving the prior state untouched, no rename-before-ready borrow). Every new test in this plan is characterization coverage confirming that design, not a RED gate that drove a fix."
  - "The two-color-overlap bug caught mid-execution — HUNTER and OLIGARCH both include wt_red, which broke the first draft of the fog-leak test with a false positive — is documented in Issues Encountered below; PHANTOM/OLIGARCH is the only starter-preset pair with zero card overlap and is what the fog case now uses."

requirements-completed: [DECK-02, DECK-05]

coverage:
  - id: D1
    description: "The room re-decides loadout legality itself via validateLoadout(); a client's own gate is never trusted (DECK-02's authoritative half)"
    requirement: "DECK-02"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#rejects a %s loadout with the engine's own message (it.each over WRONG_SIZE, UNKNOWN_CARD, ICON_LIMIT, TOO_FEW_COLORS, OVER_BUDGET)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A connection can only ever change its own seat's loadout, whatever seat identity a frame claims; a rejected submission destroys nothing"
    requirement: "DECK-02"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#two human seats each own their own deck; a rejected submission destroys nothing; the match deals each seat what it submitted"
        status: pass
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#a rejected submission leaves the previously stored deck exactly as it was"
        status: pass
    human_judgment: false
  - id: D3
    description: "Whichever loadout a seat last successfully submitted is the loadout that seat plays; a seat that never submitted, or whose stored deck stops validating, gets a known-good fallback instead (DECK-05's server half)"
    requirement: "DECK-05"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#a four-human room deals each seat exactly the distinct legal deck it submitted"
        status: pass
      - kind: unit
        ref: "apps/party/tests/botfill.test.ts#a human seat whose stored deck no longer validates plays the safe PHANTOM fallback, not the invalid stored deck"
        status: pass
    human_judgment: false
  - id: D4
    description: "No frame a non-owning connection receives across a full lobby-to-match-start sequence carries another seat's card ids; the public lobby snapshot's seat objects carry exactly six fields"
    requirement: "DECK-02"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#no frame a non-owning connection received across the whole lobby-to-match-start sequence contains the owner's card ids, and every snapshot seat has exactly six keys"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every room-lifecycle phase treats a loadout submission correctly: LOBBY/LOADOUT accept, IN_GAME/ENDED refuse without touching the running match, an unbound connection is a silent no-op, and a ready seat is still accepted"
    requirement: "DECK-02"
    verification:
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#refuses a submission once the room is IN_GAME, and neither the seat nor the running match own deck moves"
        status: pass
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#once the room has ended > refuses a submission with WRONG_PHASE and leaves the stored deck untouched"
        status: pass
      - kind: integration
        ref: "apps/party/tests/loadout.test.ts#accepts a submission while the room phase is LOADOUT, matching startMatch's own guard"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-08-29
status: complete
---

# Phase 2 Plan 3: Loadout Security & Adversarial Contract Summary

**Grew `apps/party/tests/loadout.test.ts` from Plan 02-01's 3-case happy path into a 21-case adversarial contract covering cross-seat isolation, all five engine violation codes, every room-phase guard, and a literal wire-frame fog scan — with zero production code changes, because Plan 02-01's `handleSubmitLoadout`/`setLoadout`/`startMatch` already satisfied every case.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-29T20:30:00Z (approx.)
- **Completed:** 2026-08-29T21:10:57Z
- **Tasks:** 3 completed
- **Files modified:** 2 (`apps/party/tests/loadout.test.ts`, `apps/party/tests/botfill.test.ts`)

## Accomplishments

- **Task 1 (tracer):** Proved the mirror image of Plan 02-01's happy path — two human seats in one room each own their own submitted deck, a rejected illegal submission from one seat leaves both seats' stored decks untouched, and `startMatch` deals each of them exactly what they submitted. Drives the room's own `onMessage` router through `createTestRoom`, never `handleSubmitLoadout` directly.
- **Task 2 (TDD):** Pinned the room's complete phase-guard and violation-handling contract: an unbound connection's silent no-op, idempotent resubmission, wholesale (never merged) overwrite on a legal-but-different resubmission, a rejected submission leaving the prior stored deck exactly as it was, all five `validateLoadout` violation codes rejected with the engine's own message (asserted against an in-test `validateLoadout()` call, never restated text), a ready seat still accepted (no rename-before-ready borrow from `setCodename`), the wire-schema-bound-vs-rules-bound distinction (65 cards → `BAD_MESSAGE` before any engine call, 64 cards → a real `WRONG_SIZE`), and the elevation-of-privilege guard refusing a submission once the room is `IN_GAME` or `ENDED` while leaving the running match's own dealt loadout untouched.
- **Task 3 (TDD):** Proved match-start dealing end to end — a four-human room deals each seat exactly its distinct submitted deck; a literal scan of every frame a non-owning connection received across a full lobby-to-match-start sequence contains none of the other seat's card ids; every `ROOM_STATE` seat object has exactly six keys; and a post-`startMatch` resubmission changes nothing in the running `gameState`. Extended `apps/party/tests/botfill.test.ts` with the two `startMatch`-level cases that belong beside its existing bot-roster/idempotence coverage: a stored deck that stops validating between submission and match start falls back to `PHANTOM`, and `passivesAvailable` matches `consumablePassivesIn` of the loadout each player actually received, bots included.
- Every violation fixture (`WRONG_SIZE`, `UNKNOWN_CARD`, `ICON_LIMIT`, `TOO_FEW_COLORS`, `OVER_BUDGET`) is built by filtering `ALL_CARDS` at test-run time rather than hand-typing card ids — only one deliberately invented id (`zz_totally_made_up`) is written by hand, exactly as the plan's own acceptance criteria requires.
- Full suite: `pnpm test` — 313 tests across 28 files, all green. `pnpm typecheck` exits 0.

## Task Commits

1. **Task 1: End-to-end "your frame cannot touch my seat, and an illegal deck never reaches a match"** - `7da06b6` (feat)
2. **Task 2 RED: The room's answer is the engine's answer, in every phase** - `ea189a8` (test)
3. **Task 3 RED: Match start deals the right deck to every seat, and tells no one else** - `feb5934` (test)

_No GREEN commits exist for Task 2 or Task 3 — see "TDD Gate Compliance" below for why that's a documented outcome, not a skipped gate._

## Files Created/Modified

- `apps/party/tests/loadout.test.ts` - grown from 3 to 21 test cases: cross-seat isolation (Task 1), the five-violation-code contract, phase guards, payload bounds, idempotence (Task 2), and match-start dealing plus the wire-level fog scan (Task 3)
- `apps/party/tests/botfill.test.ts` - two new `startMatch`-level cases: the no-longer-validates fallback, and `passivesAvailable` consistency across bots and humans

## Decisions Made

- Followed the plan as specified. The one genuine engineering decision this plan made was test-fixture design, not production code: which starter-preset pair to use for the fog-leak scan (PHANTOM/OLIGARCH — the only pair among the four starters with zero card-id overlap), and how to reach the room's unused `LOADOUT` phase for its one acceptance case (mutating the live `RoomState` object `roomState()` returns, rather than adding a new test-harness setter or a new production phase-transition path neither this phase nor 02-RESEARCH.md's Open Question A3 called for).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in my own draft] HUNTER/OLIGARCH card overlap produced a false-positive fog-leak failure**
- **Found during:** Task 3, first run of the fog-scan test
- **Issue:** My first draft used HUNTER (host) and OLIGARCH (guest) for the fog-leak case. Both presets independently include `wt_red` (each deck was built for a different faction identity but happens to want the same RED wiretap card), so the guest's own legitimately-held card was flagged as "leaked from the host."
- **Fix:** Switched the fog case to PHANTOM (host) and OLIGARCH (guest) — verified by inspection to share zero card ids — so any matched substring in the other connection's frames can only mean a genuine leak, never a coincidence of both seats holding the same card.
- **Files modified:** `apps/party/tests/loadout.test.ts`
- **Verification:** `pnpm vitest run apps/party/tests/loadout.test.ts` — the fog case passes cleanly; no other case uses this deck pairing.
- **Committed in:** `feb5934` (Task 3 commit) — caught before the commit, not a separate fix-up commit.

---

**Total deviations:** 1 (a test-fixture bug in my own draft, caught and fixed before committing; not a production-code deviation). No scope creep — no file outside the plan's declared `apps/party/tests/loadout.test.ts` / `apps/party/tests/botfill.test.ts` scope was touched.

## Issues Encountered

**Stale worktree base, same class of issue documented in 02-01-SUMMARY.md.** This plan's assigned worktree (`worktree-agent-ab9db65e7f0eb6077`) was checked out at `d8f8877` — the phase-01 PR's squash-merge commit into `main` — rather than at the tip of `gsd/phase-02-deckbuilder-persistent-loadouts`. Unlike Plan 02-01's stale-worktree incident (a strict ancestor, fixed with a fast-forward merge), this worktree's base was a *different* commit lineage (main's squash-merge vs. the phase branch's incremental history), so `git merge --ff-only` was not possible. Verified byte-for-byte content equivalence between the worktree's `HEAD` and the phase branch's pre-Phase-2 commit (`git diff` showed only three `.planning/phases/01-*` documentation files differing, zero code differences), then used `git reset --hard gsd/phase-02-deckbuilder-persistent-loadouts` to move the disposable per-agent branch onto the correct base — safe because the worktree had zero commits of its own and a clean working tree at the time. Flagging this as an environment/harness setup issue for the orchestrator, not a plan or execution deviation. `pnpm install` was also required — `node_modules` did not exist in the worktree at spawn time.

## User Setup Required

None - no external service configuration required.

## TDD Gate Compliance

**Task 2** (`tdd="true"`): gate sequence in git log:
1. `test(02-03)` commit `ea189a8` — 18 new/grown test cases, all passing on first run against the existing `apps/party/src/handlers.ts`/`state.ts`.
2. **No `feat(02-03)` commit follows it.** Investigation (careful re-reading of `handleSubmitLoadout`, `setLoadout`, and their phase guards against every behavior in the task's `<behavior>` list) found no gap: Plan 02-01 already resolves the acting seat via `seatFor(connectionId)` only, already returns the untouched `state` on the rejection branch, already admits both `LOBBY` and `LOADOUT` in its phase guard, and already omits a rename-before-ready check on `setLoadout`. This is characterization coverage of an already-correct implementation, not a skipped RED gate — the tests were written first, run, and found passing; no fix was withheld to force a GREEN commit that would have contained no real change.

**Task 3** (`tdd="true"`): gate sequence in git log:
1. `test(02-03)` commit `feb5934` — 3 new `loadout.test.ts` cases plus 2 new `botfill.test.ts` cases, all passing on first run against the existing `apps/party/src/settings.ts`.
2. **No `feat(02-03)` commit follows it**, for the same reason: `startMatch`'s per-seat branch already re-validates a stored deck and falls back to `PHANTOM` when it fails, and already recomputes `passivesAvailable` from the loadout each seat actually received (`consumablePassivesIn(chosen)`, not a stale value carried over from the seat's pre-loadout default).

Both gaps are the expected outcome of Plan 02-01 having been written with this exact adversarial contract already in mind — its own summary documents defense-in-depth double validation, a `PHANTOM` fallback, and seat-scoped resolution as deliberate design, not accidents this plan happened to catch in time.

## Next Phase Readiness

Plan 02-04 (in-lobby editor) can build on a `SUBMIT_LOADOUT`/`handleSubmitLoadout`/`startMatch` path now proven against the room's own router for every phase, every violation code, and the wire-level fog boundary — no further hardening of `handlers.ts`, `state.ts`, or `settings.ts` is anticipated from that plan's scope. No blockers.

---
*Phase: 02-deckbuilder-persistent-loadouts*
*Completed: 2026-08-29*

## Self-Check: PASSED

Both modified files (`apps/party/tests/loadout.test.ts`, `apps/party/tests/botfill.test.ts`) verified present on disk with the expected test counts (21 and 17 respectively). All 3 task commits (`7da06b6`, `ea189a8`, `feb5934`) verified present in `git log`.
