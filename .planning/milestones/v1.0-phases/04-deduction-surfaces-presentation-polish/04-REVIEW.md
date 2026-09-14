---
phase: 04-deduction-surfaces-presentation-polish
reviewed: 2026-09-04T00:59:30Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - packages/shared/src/state.ts
  - packages/shared/src/view.ts
  - packages/engine/src/createMatch.ts
  - packages/engine/src/resolution/index.ts
  - packages/engine/src/fog/projectView.ts
  - apps/web/lib/motion.ts
  - apps/web/lib/format.ts
  - apps/web/lib/burnTrack.ts
  - apps/web/components/resolution/RoundHistoryPanel.tsx
  - apps/web/components/resolution/StepThrough.tsx
  - apps/web/components/intel/BurnTrackPanel.tsx
  - apps/web/components/match/MatchIntelDrawer.tsx
  - apps/web/components/match/MatchChat.tsx
  - apps/web/components/ui/PageTransition.tsx
  - apps/web/components/ui/Button.tsx
  - apps/web/components/deck/CardGrid.tsx
  - apps/web/app/page.tsx
  - apps/web/app/deck/page.tsx
  - apps/web/app/lobby/[code]/page.tsx
  - apps/web/app/match/[code]/page.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-09-04T00:59:30Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

This phase adds persisted per-round history (`GameState.history` / `PlayerView.history`), a Round History panel and Burn Track tab in a new Intel drawer, and an app-wide motion pass (`apps/web/lib/motion.ts` shared variants, page-mount transitions, Button hover fills, CardGrid flip animation).

The central correctness question this review was asked to verify — whether round history is filtered exactly once, at round-resolution time, against the round's own state, and never re-filtered later against a newer `GameState` — **holds**. `resolveRound()` calls `filterEvents(draft, ctx.log, pid)` once per player immediately after logging the round, appends the result to `draft.history`, and `projectView()` copies that stored slice verbatim with no second reduction call. `tests/history.test.ts` and `tests/fog-leak.test.ts` both exercise this invariant directly, including a regression test for the exact "later position upgrades an old entry" pitfall. No opponent agent id, safehouse, trap, or cooldown reaches `PlayerView.history` through any path traced in this review.

That said, the history-filtering loop's own comment overstates its precision: by the time it runs, `upkeep()` has already advanced `draft.round` to the *next* round, so the filtering call is not, as claimed, run "against this round's just-resolved state" in full — only the parts `filterEvents` actually reads (agent positions, passives, vision groups) are unaffected by that particular staleness today. That's a real latent-bug class, not a live one; see WR-01, which also surfaces a live, if not-yet-user-visible, instance of the same staleness pattern one line below in `generateSignals()`.

The motion pass introduced one real interaction-quality regression (WR-02: forced remount on every deck-card toggle destroys button focus) and a reused-component accessibility mismatch (WR-03: `aria-live="polite"` fires for static historical replays, not just the live incremental one). Two minor type/a11y nits are recorded as Info.

## Warnings

### WR-01: History/signal round-stamping runs after `upkeep()` has already advanced `draft.round`

**File:** `packages/engine/src/resolution/index.ts:52-73`
**Issue:** `upkeep(ctx)` (line 52) ends with `state.round += 1`. The new history-filtering loop and the pre-existing `draft.signals = generateSignals(draft, ctx.log)` call both run *after* that increment (lines 63-73), even though they are processing `ctx.log` — the event log for the round that just finished. The loop's own comment claims it filters "against `draft` — this round's just-resolved state," but `draft.round` at that point is already the *next* round's number.

Today this is harmless for `filterEvents()`/`audibilityFor()`/`visionGroup()`/`hasPassive()` — none of them read `state.round` — so the history-append itself produces correct output. But it is not harmless for `generateSignals()` (`packages/engine/src/fog/signals.ts:30`, `const round = state.round;`), which stamps every `Signal` emitted for the round that just resolved (chatter, "not alone", informant reports, Radio Intercepts, border crossings, burns, strikes, blockade signals — everything) with the *next* round's number, i.e. every signal a player receives is off by one round relative to the events it describes. This is not caught by any test in scope and is not yet rendered anywhere in `apps/web` (no component currently consumes `PlayerView.signals`; see IN-02), so it is not user-visible today — but it is exactly the "grading a round against a newer state" defect class `04-RESEARCH.md` calls Pitfall 1/2, manifesting one line away from the code that was written specifically to avoid it.
**Fix:** Capture the round the log belongs to before `upkeep()` mutates it, and use that captured value for both the history filter comment's stated invariant and (separately, when `signals.ts` is next touched) `generateSignals`'s round stamp — e.g.:
```ts
draft.lastRoundLog = ctx.log;
const resolvedRound = draft.round; // before upkeep() ran; still off — see below

upkeep(ctx); // mutates draft.round

// ...filter using `resolvedRound`-aware logic, or reorder the whole
// logging/signal block to run before upkeep() so draft.round still equals
// the round that was resolved.
```
The safer structural fix is to move the entire "log, filter, generate signals" block to run *before* `upkeep(ctx)`, since none of that logic depends on upkeep's side effects (Intel income, cooldown ticks, trap/decoy expiry, dossier respawns).

### WR-02: CardTile's remount-on-toggle key destroys keyboard focus on every Add/Remove

**File:** `apps/web/components/deck/CardGrid.tsx:50-51`
**Issue:** `CardTile` sets `key={inLoadout ? 'in' : 'out'}` on its own root `motion.div` specifically so React unmounts and remounts the tile on every membership toggle (per the file's own comment), which is what makes the `cardFlipVariant` mount animation replay on each click. The Add/Remove `<Button>` is a child of that remounted subtree. A keyboard user who activates the button (Enter/Space) triggers `onAdd`/`onRemove`, the parent's `loadout` prop changes, `inLoadout` flips, the key changes, and the entire tile — including the button that just had focus — is destroyed and replaced by a new DOM node. Focus is not restored anywhere, so it silently reverts to `document.body`, breaking the keyboard tab sequence through a 34-card grid (`apps/web/components/CLAUDE.md`'s accessibility expectations, and the project's stated "board is keyboard-navigable" ethos extends naturally to the deckbuilder's own primary interaction).
**Fix:** Keep the tile's DOM node stable across the toggle and re-trigger only the animated portion (e.g. key the inner icon/flip wrapper, not the whole tile, or use Motion's `animate` prop with a state-driven `rotateY` value instead of `initial`/remount), or restore focus explicitly after remount:
```tsx
const btnRef = useRef<HTMLButtonElement>(null);
// after toggling, in an effect keyed on inLoadout: btnRef.current?.focus();
```

### WR-03: `StepThrough`'s `aria-live="polite"` fires for static historical replays too

**File:** `apps/web/components/resolution/StepThrough.tsx:63`
**Issue:** `<ol aria-live="polite">` is unconditional, but `StepThrough` now serves two very different consumers: the live `mode="step"` reveal (where `aria-live` is exactly right — each click-to-advance row should be announced) and `RoundHistoryPanel`'s `mode="full"` (`apps/web/components/resolution/RoundHistoryPanel.tsx:118`), where the *entire* historical round's event list mounts at once inside that same live region. For a screen-reader user, expanding a past round in the Round History panel will trigger a burst of announcements for every event in that round simultaneously — behavior appropriate for the live resolution narration but not for a static re-read the player is choosing to expand and read at their own pace.
**Fix:** Gate the live region to step mode only:
```tsx
<ol aria-live={mode === 'full' ? undefined : 'polite'} className="flex flex-col gap-2">
```

## Info

### IN-01: `RoundHistoryPanel`'s `selfId` prop is a plain `string`, requiring a cast at the comparison site

**File:** `apps/web/components/resolution/RoundHistoryPanel.tsx:62, 86`
**Issue:** `HistoryRowProps.selfId: string` forces `(event.playerId as string) === selfId` at line 86 to compare a branded `PlayerId` against a plain `string`. The project's own convention (`packages/shared/CLAUDE.md`, `.claude/CLAUDE.md` "Branded types prevent id mixing at compile time") is to keep ids branded end-to-end specifically so a `PlayerId` can't be silently compared against or substituted for an unrelated string; this prop boundary opts back out of that guarantee for no functional benefit, since the caller (`MatchIntelDrawer.tsx:100`) already has a real `PlayerId` (`view.self.id`) to pass.
**Fix:** Type `selfId: PlayerId` (import from `@berlin/shared`) and drop the `as string` cast.

### IN-02: `Signal.round` staleness (see WR-01) has no current consumer, but will need fixing before signals ship

**File:** `packages/engine/src/fog/signals.ts:30` (not modified by this phase, discovered while verifying WR-01)
**Issue:** No file under `apps/web` currently reads `PlayerView.signals` (confirmed by search — no non-test reference exists yet), so the off-by-one round stamp described in WR-01 has no visible effect today. Recording this so it isn't rediscovered independently when the signals log UI is built in a later phase.
**Fix:** Fix alongside WR-01 — both share the same root cause (`generateSignals`/history-filtering reading `state.round` after `upkeep()`'s increment).

### IN-03: Burn Track and drawer badge updates carry no `aria-live` region

**File:** `apps/web/components/intel/BurnTrackPanel.tsx:43`, `apps/web/components/match/MatchIntelDrawer.tsx:60-62`
**Issue:** New Burn Track entries render into a plain `<ul>` with no `aria-live`, and the collapsed drawer's unseen-count badge (`{badgeCount}`) updates with no accessible announcement. A screen-reader user gets no notice that their capability profile changed or that unseen entries exist, unlike sighted players who see the badge appear. This is a lower-severity a11y gap than WR-03 since nothing here is actively wrong (no misleading announcement), just an omission.
**Fix:** Consider `aria-live="polite"` on the badge's container, or a visually-hidden status message when `badgeCount` transitions from 0.

---

_Reviewed: 2026-09-04T00:59:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
