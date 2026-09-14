---
phase: 04-deduction-surfaces-presentation-polish
verified: 2026-09-04T01:03:24Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 04: Deduction Surfaces & Presentation Polish Verification Report

**Phase Goal:** Players can reason about what has been revealed across the whole match, and the app stops looking like a prototype.
**Verified:** 2026-09-04T01:03:24Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria, merged with plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Player can open a round history/log and re-read every past resolution in the current match | ✓ VERIFIED | `GameState.history`/`PlayerView.history` persisted server-side (`packages/shared/src/state.ts:128`, `view.ts:143`), appended once at resolution (`resolution/index.ts:69-71`), copied without re-filtering in `projectView.ts:104-123` (2 `filterEvents` call sites, confirmed by grep). `RoundHistoryPanel.tsx` renders newest-first rows with `Round {N} — {headline}` text, and `Expand` renders the full round through the existing `StepThrough` (`mode="full"`) — no second renderer. `packages/engine/tests/history.test.ts` (8 tests) proves persisted-history correctness end-to-end with real `createMatch`/`resolveRound` drives. |
| 2 | Round history survives refresh/mid-match reconnect (server state, not client-accumulated) | ✓ VERIFIED | History lives in `GameState`, delivered inside `PlayerView` on every `VIEW`/`ROUND_RESOLVED` frame; zero `apps/party/` changes across the whole phase (confirmed by `git diff --name-only` per-plan ranges below), so history rides the existing wire protocol unchanged. Human-verify Task 3 Part C (steps 17-18) explicitly exercised a mid-match reconnect and confirmed history was not shortened. |
| 3 | Historical audibility never drifts (a stored round is frozen, never re-graded against a later state) | ✓ VERIFIED (behavior-dependent, test-exercised) | `packages/engine/tests/history.test.ts` "a stored round is frozen the instant it is stored" test scripts a real strike, then moves the viewing player's agent adjacent to the strike node in a later round and re-asserts deep-equality of the round-1 entry — this is a genuine state-transition/non-regression test, not a presence check, and it passes. `fog-leak.test.ts` extended to prove its deep scan actually reaches a non-empty `history` field (not vacuous). |
| 4 | Player can view their own Burn Track panel showing exactly what opponents have learned, updating as rounds resolve | ✓ VERIFIED | `BurnTrackPanel.tsx` renders `view.burnTracks[view.self.id]` (passed by `MatchIntelDrawer.tsx`, `apps/web/components/match/MatchIntelDrawer.tsx:39,102`), oldest-to-newest, via `burnEntryLabel()` (`apps/web/lib/burnTrack.ts`). Zero `packages/`/`apps/party/` changes in Plan 04-03 (confirmed below) — pure UI over data already wired end to end from Phase 1-3. New-entry badge is a derived value on the collapsed toggle. `apps/web/lib/burnTrackPanel.test.ts` (17 tests) covers label formatting and static-source wiring. |
| 5 | A Cutout-suppressed Burn Track entry shows icon+round only, never a synthesized suppression tag | ✓ VERIFIED | `burnEntryLabel()` filters `[entry.icon, entry.sector, 'Round N']` on `!== null`, so the two-segment and three-segment forms share one code path. `BurnTrackPanel.tsx` renders the sector swatch only `entry.sector !== null`. Suppression decision itself lives in pre-existing `packages/engine/src/resolution/ctx.ts:118` (`redact ? {...entry, sector: null} : entry`), untouched by this phase. Test asserts source does not match `/Cutout|Redact/i`. |
| 6 | Panel/page transitions, hover states, card flips, and button/loading feedback applied consistently across home, deckbuilder, lobby, match | ✓ VERIFIED | All four route roots (`app/page.tsx`, `app/deck/page.tsx`, `app/lobby/[code]/page.tsx`, `app/match/[code]/page.tsx`) wrap their root in `<PageTransition>` (confirmed by grep on each file). `Button.tsx` has `enabled:hover:bg-[#1d4ed8]`/`enabled:hover:bg-[#b91c1c]` plus `HOVER_TRANSITION_CLASS`. `CardGrid.tsx` tiles use `cardFlipVariant`. `MatchChat`/`MatchIntelDrawer` toggles share hover treatment. `apps/web/lib/motionPass.test.ts` (21 tests) pins adoption across all 7 animated components with a cross-file loop. Human-verify Task 3 Part A (steps 1-10) walked every screen with motion on. |
| 7 | With OS reduced-motion preference enabled, motion is suppressed without breaking any interaction | ✓ VERIFIED | `apps/web/lib/motion.ts`'s `fadeSlideUpVariant`/`cardFlipVariant` set `initial: false` under reduced motion (instant cut, never a zero-duration flash) while `animate` stays identical regardless of the reduced-motion input — pinned by 11 real behavioural tests in `apps/web/lib/motion.test.ts`. `HOVER_TRANSITION_CLASS` deliberately sits outside the reduced-motion branch. Human-verify Task 3 Part B (steps 11-16) exercised the OS preference end-to-end (macOS/Windows) and the user responded "approved" — no failing step reported, per the explicit note that this satisfies the checkpoint. |
| 8 | `apps/web/lib/motion.ts` is the single reduced-motion decision point — no component reimplements the branch | ✓ VERIFIED | `StepThrough.tsx` (the file the utility was extracted from) refactored onto `fadeSlideUpVariant`, removing its original inline ternary, with `apps/web/lib/stepThrough.test.ts` unmodified and green (44 tests, `git diff --stat` zero). `motionPass.test.ts` asserts a cross-file loop over all 7 animated components: each importer of `useReducedMotion` also imports the shared module, and the inline ternary form appears zero times app-wide. |
| 9 | Home route stays a React Server Component despite the page-mount transition | ✓ VERIFIED | `apps/web/app/page.tsx` has no `'use client'` directive; `PageTransition.tsx` is the client boundary, taking server-rendered `children` as a prop. `pnpm --filter web build` output shows `/` as `○ (Static)` — confirms RSC/static prerendering held. |
| 10 | No engine/protocol/`apps/party` file touched by the pure-UI plans (04-02, 04-03, 04-04); only 04-01 touches `packages/` (never `apps/party/`) | ✓ VERIFIED | `git diff --name-only` across each plan's commit range: 04-01 (`c37689b..af5cd20`) touches 7 `packages/` files and zero `apps/party/`; 04-02, 04-03, 04-04 ranges all return empty for both `packages/` and `apps/party/`. |

**Score:** 10/10 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/state.ts` | `GameState.history` field | ✓ VERIFIED | Line 128, `Record<string, ResolutionEvent[][]>`, sibling to `burnTracks`/`lastRoundLog` |
| `packages/shared/src/view.ts` | `PlayerView.history` field | ✓ VERIFIED | Line 143, flat `readonly (readonly ResolutionEvent[])[]` — structurally cannot hold another player's log |
| `packages/engine/src/resolution/index.ts` | reduce-once-per-player history append | ✓ VERIFIED | Lines 69-71, calls `filterEvents(draft, ctx.log, pid)` against the contemporaneous draft |
| `packages/engine/src/fog/projectView.ts` | zero-reduction history copy | ✓ VERIFIED | `filterEvents` occurrence count = 2 (import + pre-existing `lastRound` call); history built by direct copy |
| `packages/engine/tests/history.test.ts` | persisted-history + stability regression | ✓ VERIFIED | 211 lines, 8 tests, includes scripted audibility-freeze regression |
| `apps/web/lib/motion.ts` | shared motion tokens/variants | ✓ VERIFIED | `DURATION`, `EASING`, `fadeSlideUpVariant`, `cardFlipVariant`, `HOVER_TRANSITION_CLASS` all exported, framework-agnostic (no `motion/react` import) |
| `apps/web/components/resolution/RoundHistoryPanel.tsx` | headline rows + expand/collapse into StepThrough | ✓ VERIFIED | Renders `roundHeadline`/`roundNumberOf`, single `<StepThrough … mode="full" isFinal={false}>`, destructive stripe on own-agent burns |
| `apps/web/components/match/MatchIntelDrawer.tsx` | bottom-left dock, two tabs, badge | ✓ VERIFIED | `fixed bottom-4 left-4`, `History`/`Burn Track` tab switcher, derived badge count |
| `apps/web/lib/format.ts` | `roundHeadline`/`roundNumberOf` | ✓ VERIFIED | Priority-ordered, capped-at-two-clause, pluralized; `EXTRACTION`-over-pickup documented |
| `apps/web/lib/burnTrack.ts` | `burnEntryLabel`, `SECTOR_SWATCH`, `BURN_TRACK_COPY` | ✓ VERIFIED | Pure module, no React/motion import; swatch hex values match `CardGrid.tsx` |
| `apps/web/components/intel/BurnTrackPanel.tsx` | own-track rendering, per-entry suppression | ✓ VERIFIED | Takes `readonly BurnEntry[]` only (never full `PlayerView`), oldest-to-newest, no `.reverse(` |
| `apps/web/components/ui/PageTransition.tsx` | RSC-safe route-mount wrapper | ✓ VERIFIED | Client wrapper, `fadeSlideUpVariant`, wraps children rather than the route |
| `apps/web/lib/motionPass.test.ts` | cross-file motion-adoption regression net | ✓ VERIFIED | 168 lines, 21 tests, includes 7-component loop |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `resolution/index.ts` | `fog/filterEvents.ts` | reduce once against `draft` | ✓ WIRED | `filterEvents(draft, ctx.log, pid)` at line 69, immediately after `draft.lastRoundLog` set |
| `fog/projectView.ts` | `shared/src/view.ts` | direct-copy, no re-filter | ✓ WIRED | `state.history[viewer as string] ?? []` mapped by shallow copy, zero new filter calls |
| `MatchIntelDrawer.tsx` | `RoundHistoryPanel.tsx` / `BurnTrackPanel.tsx` | tab-switched render | ✓ WIRED | `view.history`/`ownTrack` passed as props |
| `apps/web/app/match/[code]/page.tsx` | `MatchIntelDrawer.tsx` | mounted twice (live + result) | ✓ WIRED | Confirmed at lines 156 and 219 |
| `RoundHistoryPanel.tsx` | `apps/web/lib/format.ts` | `roundHeadline`/`roundNumberOf` | ✓ WIRED | No inline headline string building |
| `RoundHistoryPanel.tsx` | `StepThrough.tsx` | `mode="full"` expand | ✓ WIRED | Single `<StepThrough` call site, `isFinal={false}` always |
| `BurnTrackPanel.tsx` | `apps/web/lib/burnTrack.ts` | `burnEntryLabel` | ✓ WIRED | No inline entry-string building |
| `apps/web/app/*/page.tsx` (×4) | `PageTransition.tsx` | route-root mount wrapper | ✓ WIRED | Confirmed present in all four route files by grep |
| `StepThrough.tsx` | `apps/web/lib/motion.ts` | `fadeSlideUpVariant` (refactor) | ✓ WIRED | Inline ternary removed; `stepThrough.test.ts` unmodified and green |
| `Button.tsx` | `apps/web/lib/motion.ts` | `HOVER_TRANSITION_CLASS` | ✓ WIRED | Imported and applied to base class string |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `RoundHistoryPanel` | `history` prop | `view.history` ← `GameState.history[viewer]` via `projectView` | Yes — populated by real `resolveRound()` per-player reduction over 580 passing tests, including a real multi-round drive in `history.test.ts` | ✓ FLOWING |
| `BurnTrackPanel` | `entries` prop | `view.burnTracks[view.self.id]` ← pre-existing `appendBurn()` pipeline | Yes — field already populated end-to-end since Phase 1-3; this phase adds no new data source | ✓ FLOWING |
| `PageTransition` mounts | route children | server-rendered React tree passed as `children` | Yes — not a static placeholder; real page content | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `pnpm test` | 580/580 passing, 45 test files | ✓ PASS |
| Typecheck | `pnpm typecheck` | clean, no errors | ✓ PASS |
| Production build (RSC boundary) | `pnpm --filter web build` | succeeds; `/` shown as `○ (Static)` | ✓ PASS |
| `filterEvents` occurrence discipline in `projectView.ts` | `grep -c filterEvents projectView.ts` | 2 (import + pre-existing `lastRound` call) | ✓ PASS |
| Fog-leak deep scan reaches `history` non-vacuously | `pnpm test fog-leak` | 7/7 passing, includes the non-empty-history assertion | ✓ PASS |
| Golden replay fixtures unaffected | `pnpm test` includes `golden.test.ts` | 3/3 passing, no `UPDATE_GOLDEN=1` needed | ✓ PASS |
| `apps/party/` and `packages/` untouched outside 04-01 | `git diff --name-only` per plan range | empty for 04-02/04-03/04-04; 04-01 touches only `packages/engine`+`packages/shared` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| MATCH-06 | 04-01, 04-02 | Round history/log of past resolutions | ✓ SATISFIED | `GameState.history`/`PlayerView.history` end-to-end, `RoundHistoryPanel` + headline + drill-down |
| MATCH-07 | 04-03 | Own Burn Track panel | ✓ SATISFIED | `BurnTrackPanel.tsx`, zero engine changes, verified pure UI over `PlayerView.burnTracks` |
| POLISH-01 | 04-01 (seed), 04-04 | Consistent transitions/hover/flips/loading feedback, reduced-motion respected | ✓ SATISFIED | `motion.ts` single decision point, adoption pinned by `motionPass.test.ts`, human-verified end to end |

No orphaned requirements: REQUIREMENTS.md's traceability table maps exactly MATCH-06, MATCH-07, POLISH-01 to Phase 4, and all three appear in plan frontmatter `requirements:` fields.

### Anti-Patterns Found

None. Scanned all 20 files modified across the four plans (`packages/shared/src/state.ts`, `view.ts`; `packages/engine/src/createMatch.ts`, `resolution/index.ts`, `fog/projectView.ts`; `apps/web/lib/motion.ts`, `format.ts`, `burnTrack.ts`; `apps/web/components/resolution/RoundHistoryPanel.tsx`, `StepThrough.tsx`; `apps/web/components/match/MatchIntelDrawer.tsx`, `MatchChat.tsx`; `apps/web/components/intel/BurnTrackPanel.tsx`; `apps/web/components/ui/PageTransition.tsx`, `Button.tsx`; `apps/web/components/deck/CardGrid.tsx`; all four route `page.tsx` files) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and placeholder-language patterns. Zero hits.

### Human Verification Required

None outstanding. Plan 04-04's Task 3 (`checkpoint:human-verify`, gate="blocking") already covered every visual/behavioral item that a static-source or node-environment test could not reach — Round History row rendering and expand-to-replay, Burn Track entry rendering including Cutout suppression, Intel drawer positioning relative to `MatchChat`, the full app under both normal and OS reduced-motion preferences, and the two backstop checks (no loading skeleton before first `PlayerView`, history surviving a mid-match reconnect). The user responded "approved" after reviewing all 19 numbered steps across Parts A/B/C, with no step flagged as failing. Per this verification's task instructions, that response is treated as satisfied human-verification evidence, not an open gap — it directly supersedes the narrower `human_judgment: true` items individually flagged in 04-01/04-02/04-03's SUMMARY.md coverage sections (those flagged items describe exactly the same visual surfaces the 04-04 sweep exercised).

### Gaps Summary

No gaps. All ten observable truths (the four ROADMAP success criteria plus six supporting must-haves spanning data integrity, fog-of-war correctness, and motion-system consistency) are verified against the actual codebase: the full 580-test suite passes, `pnpm typecheck` and `pnpm --filter web build` are both clean, the security-sensitive fog-of-war reduction-once invariant is pinned by a genuine scripted regression test (not a presence check), zero `apps/party/`/`packages/` files were touched outside Plan 04-01's tracer, and the phase's one blocking human-verification checkpoint was completed and approved.

---

_Verified: 2026-09-04T01:03:24Z_
_Verifier: Claude (gsd-verifier)_
