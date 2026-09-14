---
phase: 04-deduction-surfaces-presentation-polish
plan: 01
subsystem: ui
tags: [fog-of-war, resolution-pipeline, react, motion, playerview, gamestate]

requires:
  - phase: 01-playable-skeleton
    provides: resolveRound()/projectView() pipeline, StepThrough.tsx reveal component, MatchChat.tsx corner-dock template
  - phase: 03-open-lobbies-host-control-table-talk
    provides: mid-match AI-takeover-and-reclaim flow (history must be indifferent to which driver controls a seat)
provides:
  - GameState.history / PlayerView.history — persisted, per-player, already fog-filtered round log
  - apps/web/lib/motion.ts — DURATION/EASING tokens and fadeSlideUpVariant/cardFlipVariant, the app's single reduced-motion decision point
  - RoundHistoryPanel.tsx + MatchIntelDrawer.tsx — bottom-left Intel drawer showing one row per resolved round
affects: [04-02-round-history-headline-and-drilldown, 04-03-burn-track-panel, 04-04-motion-pass]

actuals:
  tokens: 8156
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Filter once, at resolution time, against the contemporaneous draft — never re-filter a stored round against a later GameState (packages/engine/src/resolution/index.ts, mirrors ctx.ts's appendBurn Cutout-redaction discipline)"
    - "Shared motion utility (apps/web/lib/motion.ts) — framework-agnostic variant builders, reduced-motion conditional lives in exactly one place, components spread the returned object onto a motion.* element"

key-files:
  created:
    - packages/engine/tests/history.test.ts
    - apps/web/lib/motion.ts
    - apps/web/lib/motion.test.ts
    - apps/web/lib/intelDrawer.test.ts
    - apps/web/components/resolution/RoundHistoryPanel.tsx
    - apps/web/components/match/MatchIntelDrawer.tsx
  modified:
    - packages/shared/src/state.ts
    - packages/shared/src/view.ts
    - packages/engine/src/createMatch.ts
    - packages/engine/src/resolution/index.ts
    - packages/engine/src/fog/projectView.ts
    - packages/engine/tests/fog-leak.test.ts
    - apps/web/app/match/[code]/page.tsx

key-decisions:
  - "history: Record<string, ResolutionEvent[][]> on GameState, keyed by PlayerId cast to string exactly like burnTracks/signals — sibling field, same convention"
  - "PlayerView.history is a flat readonly array, never a Record keyed by player id — history is not symmetric-public like burnTracks, so the type itself cannot hold another player's log"
  - "resolveRound() calls filterEvents() once per player, immediately after draft.lastRoundLog is set, against draft (the just-resolved state) — the single load-bearing correctness fix for RESEARCH.md Pitfall 1/2"
  - "projectView() copies state.history[viewer] by direct structured copy — zero new filterEvents() call sites, confirmed by the plan's own grep-count acceptance criteria"
  - "Tracer task (type=tracer) was treated as the autonomous path: verify passed (pnpm test history && pnpm typecheck), so execution continued straight into Tasks 2/3 rather than pausing for an interactive checkpoint — this is a non-interactive worktree executor with no live human channel, and the harness's Auto Mode directive biases toward continuing. Documented here as the discretion call it is."

patterns-established:
  - "History-append discipline: any future round-scoped per-player field follows resolveRound()'s history-append pattern (reduce once, immediately after lastRoundLog, against draft) rather than reducing at projectView() read time"
  - "apps/web/lib/motion.ts is the only place a reduced-motion branch may be written; new animated components import a variant instead"

requirements-completed: [MATCH-06, POLISH-01]

coverage:
  - id: D1
    description: "GameState.history / PlayerView.history: persisted per-player fog-filtered round log, filtered once at resolution time"
    requirement: "MATCH-06"
    verification:
      - kind: unit
        ref: "packages/engine/tests/history.test.ts — all 8 tests (empty-on-create, N-entries-after-N-rounds, newest-equals-lastRound, ROUND_START-per-entry, per-viewer-divergence, stability regression, live-capture equality, no-cross-viewer-bleed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Historical audibility never drifts when the viewer's own agent later moves near/away from an old strike node (RESEARCH.md Pitfall 1/2)"
    requirement: "MATCH-06"
    verification:
      - kind: unit
        ref: "packages/engine/tests/history.test.ts#a stored round is frozen the instant it is stored"
        status: pass
      - kind: unit
        ref: "packages/engine/tests/fog-leak.test.ts#the deep-scan above actually reaches PlayerView.history"
        status: pass
    human_judgment: false
  - id: D3
    description: "Intel drawer (bottom-left corner dock) lists one row per resolved round, newest first, with the defined empty state before round 1"
    requirement: "MATCH-06"
    verification:
      - kind: unit
        ref: "apps/web/lib/intelDrawer.test.ts — all 9 static-source assertions"
        status: pass
    human_judgment: true
    rationale: "No React component-testing stack in this repo (apps/web/lib/CLAUDE.md testing_note) — the visual rendering of the drawer (correct row order, actual screen position, expand/collapse interaction) can only be confirmed by opening the running app, which this non-interactive worktree executor cannot do. Static-source checks prove the conventions are wired correctly but not that pixels land where specified."
  - id: D4
    description: "apps/web/lib/motion.ts is the app's single reduced-motion decision point, covered by real behavioural tests (D-08 seed for POLISH-01)"
    requirement: "POLISH-01"
    verification:
      - kind: unit
        ref: "apps/web/lib/motion.test.ts — all 11 tests"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-09-03
status: complete
---

# Phase 04 Plan 01: Persisted Round History — Tracer Summary

**Server-side per-player round history (`GameState.history`/`PlayerView.history`), filtered exactly once at resolution time, delivered through the existing `projectView()`/wire protocol, and rendered as a bottom-left Intel drawer — plus `apps/web/lib/motion.ts`, the app's one shared reduced-motion utility.**

## Performance

- **Duration:** ~12 min (task execution; excludes worktree/dependency setup)
- **Started:** 2026-09-03T11:41:44-07:00 (first RED commit)
- **Completed:** 2026-09-03T11:49:11-07:00 (final task commit)
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- `GameState.history: Record<string, ResolutionEvent[][]>` — a persisted, per-player, already-fog-filtered round log, computed once inside `resolveRound()` against the round's own just-resolved `draft`, never re-derived later. This is the load-bearing correctness fix for RESEARCH.md Pitfall 1/2 (strike-audibility mis-grading if a stored round were re-filtered against a newer state).
- `PlayerView.history: readonly (readonly ResolutionEvent[])[]` — the viewer's whole match history, flat (not keyed by player id like the symmetric-public `burnTracks`), delivered by direct structured copy in `projectView()` with zero new reduction call sites.
- `apps/web/lib/motion.ts` (D-08 seed): `DURATION`/`EASING` tokens, `fadeSlideUpVariant`/`cardFlipVariant`, `HOVER_TRANSITION_CLASS` — framework-agnostic (no `motion/react` import, no `useReducedMotion` call) so it's importable from a plain node-environment vitest file.
- `RoundHistoryPanel.tsx` + `MatchIntelDrawer.tsx` — a bottom-left corner-docked drawer (mirroring `MatchChat`'s bottom-right dock so the two never overlap), listing one condensed row per resolved round, newest first, with the defined `No rounds yet` empty state before round 1. Mounted on both the live-play and result-screen branches of the match route.
- Zero `apps/party/` changes — confirmed by `git diff --name-only` across all four commits in this plan.
- The multi-round audibility-stability regression (Task 2) directly pins the "filtered once, never re-filtered" invariant with a scripted scenario, plus a "live-capture equals final" test that specifically distinguishes the correct design from a defective one that happens to produce the same shape.
- The fog-leak deep scan (`packages/engine/tests/fog-leak.test.ts`) is now proven to reach `PlayerView.history` non-vacuously — every pre-existing assertion in that file is untouched (`git diff` shows additions only).

## Task Commits

Each task was committed atomically, following the plan's RED→GREEN sequencing within the tracer:

1. **Task 1 (tracer): One resolved round, filtered once at resolution, on screen — end to end**
   - `5f2d0d7` — `test(04-01): add failing history.test.ts for GameState/PlayerView.history` (RED)
   - `4942792` — `feat(04-01): persisted round history end to end (D-01, D-02, D-03, D-08 seed)` (GREEN)
2. **Task 2: Pin the fog-of-war invariant — historical audibility must not drift**
   - `f2531e0` — `test(04-01): pin the historical-audibility stability invariant (T-04-01, T-04-02, T-04-03)`
3. **Task 3: Pin the motion contract and the drawer conventions with runnable checks**
   - `0cb1cbb` — `test(04-01): pin the motion contract and drawer conventions (POLISH-01 seed)`

_Task 2 and Task 3 are test-only (characterization coverage over Task 1's tracer implementation, consistent with the 02-04 precedent recorded in STATE.md), so each is a single commit rather than a RED/GREEN pair — there is no new production behavior to implement, only to pin._

## Files Created/Modified

- `packages/shared/src/state.ts` — `GameState.history` field
- `packages/shared/src/view.ts` — `PlayerView.history` field
- `packages/engine/src/createMatch.ts` — `history` init loop, sibling to `burnTracks`
- `packages/engine/src/resolution/index.ts` — the history-append loop, immediately after `draft.lastRoundLog = ctx.log;`
- `packages/engine/src/fog/projectView.ts` — history direct-copy block (SECURITY-REVIEWED per `packages/engine/src/fog/CLAUDE.md` rule 1 — see Security Review below)
- `packages/engine/tests/history.test.ts` — new file, persisted-history correctness (Task 1) + audibility-stability regression (Task 2)
- `packages/engine/tests/fog-leak.test.ts` — one new assertion proving the deep scan reaches `history`
- `apps/web/lib/motion.ts` — new file, the shared motion utility
- `apps/web/lib/motion.test.ts` — new file, behavioural tests over `motion.ts`
- `apps/web/lib/intelDrawer.test.ts` — new file, static-source drawer/panel/route conventions
- `apps/web/components/resolution/RoundHistoryPanel.tsx` — new file
- `apps/web/components/match/MatchIntelDrawer.tsx` — new file
- `apps/web/app/match/[code]/page.tsx` — two `<MatchIntelDrawer>` mounts (live-play, result-screen)

## Security Review

`packages/engine/src/fog/projectView.ts` is reviewed as a security change per `packages/engine/src/fog/CLAUDE.md` rule 1 (fog boundary). The history addition:
- Adds **zero** new `filterEvents()` call sites — confirmed by `grep -c 'filterEvents' packages/engine/src/fog/projectView.ts` equaling 2 (the import plus the one pre-existing `lastRound` reduction).
- Builds `history` by direct structured copy of `state.history[viewer]`, following the file's existing "build by construction" discipline (`projectView.ts` file-level doc comment).
- The actual reduction lives in `packages/engine/src/resolution/index.ts`, which now imports `filterEvents` and calls it once per player, immediately after `draft.lastRoundLog = ctx.log;`, against `draft` — the round's own just-resolved state.

**RESEARCH.md Open Question 2 — answered "both":** the generic id-leak scan (`fog-leak.test.ts`'s existing deep scan) cannot catch an audibility *mis-grading* on its own, because nothing leaks in the id sense when a stale round is re-graded — the wrong redaction *level* is simply chosen instead. That is why the explicit multi-round stability regression in `history.test.ts` (Task 2) is not redundant with the id-leak scan; each catches a different failure mode.

## Decisions Made

- `history` keyed by `PlayerId` cast to `string`, exactly matching the existing `burnTracks`/`signals` convention — no new keying pattern introduced.
- `PlayerView.history` is a flat array by deliberate contrast with `burnTracks`'s `Record<PlayerId, ...>` shape — history is not symmetric-public, so the type itself must be structurally incapable of holding another player's log (mirrors the fog-boundary discipline in `packages/shared/CLAUDE.md`).
- The tracer's post-commit feedback gate was resolved as the autonomous path (verify passed, continue) rather than an interactive checkpoint. This plan executes inside a non-interactive worktree with no live human channel to answer a `checkpoint:human-verify`; the harness's Auto Mode directive explicitly biases toward continuing over stopping. Recorded here per the plan's own instruction to document this discretion call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text accidentally violated the plan's own grep-count acceptance criteria**
- **Found during:** Task 1 (writing `projectView.ts`'s history-copy comment)
- **Issue:** An explanatory comment used the literal string `filterEvents()`, pushing `grep -c 'filterEvents' packages/engine/src/fog/projectView.ts` to 3 instead of the plan-mandated 2 (and similarly for `useReducedMotion` in `apps/web/lib/motion.ts`'s file-header comment, which needed to stay at exactly 0).
- **Fix:** Reworded both comments to convey the same intent without using the literal identifier strings the acceptance criteria count.
- **Files modified:** `packages/engine/src/fog/projectView.ts`, `apps/web/lib/motion.ts`
- **Verification:** `grep -c 'filterEvents' packages/engine/src/fog/projectView.ts` → 2; `grep -c 'filterEvents' packages/engine/src/resolution/index.ts` → 2; `grep -c 'useReducedMotion' apps/web/lib/motion.ts` → 0
- **Committed in:** `4942792` (part of Task 1's GREEN commit — caught and fixed before committing)

---

**Total deviations:** 1 auto-fixed (Rule 1 — self-caught before commit, no separate fix commit needed)
**Impact on plan:** Cosmetic only; no behavior change. No scope creep.

## Issues Encountered

- The worktree was created from a commit (`c37689b`) that predates the phase 04 planning artifacts (`.planning/phases/04-.../*.md`), which exist only as untracked working-tree files in the main repo. Copied the full phase-04 planning directory (CONTEXT/RESEARCH/PATTERNS/UI-SPEC/VALIDATION/PLAN files) into the worktree so `<context>` `@`-references in the plan could be read. These copied planning docs remain untracked in this worktree (not committed as part of this plan's deliverable) — the orchestrator's own copy in the main repo is the source of truth.
- `node_modules` was absent in the fresh worktree; resolved with `pnpm install --offline` against the existing pnpm store (no network fetch needed, lockfile already up to date).

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. `RoundHistoryPanel.tsx`'s row content is intentionally minimal this plan (`Round {N}` label only, no headline text) — this is not a stub but the explicitly scoped Task 1 deliverable; the plan's own `<action>` states the headline text and expand control "land in Plan 04-02," and `<artifacts_this_phase_produces>` names `roundHeadline`/`roundNumberOf` in `apps/web/lib/format.ts` as 04-02's symbols. `RoundHistoryPanelProps.selfId` is accepted but currently unused for the same reason (reserved for the 04-02 headline formatter) — noted inline in the component with a comment, not silently dropped.

## Next Phase Readiness

- `PlayerView.history` and the `RoundHistoryPanel`/`MatchIntelDrawer` scaffolding are in place for Plan 04-02 (row headline text via `apps/web/lib/format.ts`'s `roundHeadline()`, and expand-to-`StepThrough` drill-down).
- `apps/web/lib/motion.ts` is ready for Plan 04-03 (Burn Track entry call-out via `cardFlipVariant`) and Plan 04-04 (broader motion pass) to import directly — no further extraction needed.
- No blockers. Full suite (516 tests, up from the 487-test baseline), `pnpm typecheck`, and `pnpm test golden` (no fixture regeneration) are all green.

---
*Phase: 04-deduction-surfaces-presentation-polish*
*Completed: 2026-09-03*
