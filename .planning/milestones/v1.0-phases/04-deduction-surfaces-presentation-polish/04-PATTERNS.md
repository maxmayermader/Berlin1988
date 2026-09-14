# Phase 4: Deduction Surfaces & Presentation Polish - Pattern Map

**Mapped:** 2026-09-02
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `packages/shared/src/state.ts` (+`history` field on `GameState`) | model | CRUD (append-only) | same file, `burnTracks`/`lastRoundLog` fields (state.ts:112,120) | exact — sibling field, same file |
| `packages/shared/src/view.ts` (+`history` field on `PlayerView`) | model | request-response (fog projection) | same file, `lastRound`/`burnTracks` fields (view.ts:131-135) | exact — sibling field, same file |
| `packages/engine/src/resolution/index.ts` (`resolveRound()` appends history) | service | event-driven (round pipeline) | same file, `draft.lastRoundLog = ctx.log` (index.ts:62) | exact — same function, adjacent line |
| `packages/engine/src/fog/projectView.ts` (+`history` read) | service | transform (fog filter) | same file, `burnTracks` direct-copy block (projectView.ts:96-99) + `lastRound: filterEvents(...)` (projectView.ts:115) | exact — same file, two existing patterns to combine |
| `packages/engine/src/createMatch.ts` (+`history` init) | service | CRUD (initialization) | same file, `burnTracks` init loop (createMatch.ts:90-91) | exact — same file, sibling init |
| `apps/web/lib/motion.ts` (new) | utility | transform (animation tokens/variants) | `apps/web/components/resolution/StepThrough.tsx` inline `useReducedMotion()`/`motion.li` usage (StepThrough.tsx:4,36,46-51) | exact — this is a literal extraction of that pattern |
| `apps/web/components/resolution/StepThrough.tsx` (refactor onto `lib/motion.ts`) | component | transform (render) | itself (pre-refactor version) | exact — same file, behavior-preserving refactor |
| `apps/web/components/resolution/RoundHistoryPanel.tsx` (new) | component | request-response (read `view.history`) | `apps/web/components/match/MatchChat.tsx` (list + expand/collapse dock) and `StepThrough.tsx` (row rendering, reused directly for drill-down) | role-match — composite of two existing components |
| `apps/web/components/intel/BurnTrackPanel.tsx` (new) | component | request-response (read `view.burnTracks`) | `apps/web/components/deck/CardGrid.tsx` (tile list rendering per-item with icon/sector label) and `apps/web/lib/format.ts` (copy-formatting discipline) | role-match — no `intel/` dir exists yet, closest sibling is `deck/CardGrid.tsx`'s tile-list pattern |
| `apps/web/components/match/MatchIntelDrawer.tsx` (new) | component | request-response (corner dock, tabs) | `apps/web/components/match/MatchChat.tsx` (entire file — corner-dock/expand-collapse/unread-badge template) | exact — explicitly named as the template in CONTEXT.md/UI-SPEC |
| `apps/web/components/match/MatchChat.tsx` (add motion) | component | request-response (existing dock, motion added) | itself (pre-motion version) + `StepThrough.tsx` (motion pattern source) | exact — same file, additive motion only |
| `apps/web/lib/format.ts` (+round-headline formatter) | utility | transform (string formatting) | same file, `eventText()`/`orderRejectionText()` (format.ts:14-16,47-135) | exact — same file, sibling exported function |

## Pattern Assignments

### `packages/shared/src/state.ts` (model, CRUD)

**Analog:** same file — `burnTracks` (line 112) and `lastRoundLog` (line 120) fields on `GameState`

**Existing pattern to copy** (state.ts:110-125):
```typescript
/** Orders committed so far this round, keyed by agent id. */
pendingOrders: Record<string, AgentOrder>;
burnTracks: Record<string, BurnEntry[]>;
/** Dossiers waiting to respawn: round they become available again. */
dossierRespawns: number[];

/**
 * The unfiltered log of the round just resolved. projectView reduces this
 * per player; it is never sent raw.
 */
lastRoundLog: ResolutionEvent[];
/**
 * Per-player signals for the current round, generated at Upkeep so that
 * projectView stays a pure read and consumes no randomness.
 */
signals: Record<string, Signal[]>;
```

**Pattern to apply:** add `history: Record<string, ResolutionEvent[][]>` as a sibling field, per Record-keyed-by-player-id-of-arrays convention identical to `burnTracks`/`signals`. Per RESEARCH.md's recommendation and Pitfall 1, this field holds **already fog-filtered, per-player** results — analogous to how `burnTracks` already holds pre-redacted (at append time) data, not raw data filtered on read. Doc comment should explain the "filtered once, at resolution time, never re-filtered" invariant explicitly (mirror the `lastRoundLog` comment's warning tone: "never sent raw").

---

### `packages/shared/src/view.ts` (model, request-response)

**Analog:** same file — `lastRound` (line 135) and `burnTracks` (line 133) fields on `PlayerView`

**Existing pattern to copy** (view.ts:131-136):
```typescript
readonly signals: readonly Signal[];
/** Every player's track, including the viewer's own, identically redacted. */
readonly burnTracks: Readonly<Record<string, readonly BurnEntry[]>>;
/** Last round's events, already filtered to this player's entitlement. */
readonly lastRound: readonly ResolutionEvent[];
```

**Pattern to apply:** add `history: readonly ResolutionEvent[][]` — a **flat array**, not a `Record<PlayerId, ...>` (unlike `burnTracks`, which is deliberately symmetric-public per `docs/ARCHITECTURE.md` §4.2). This follows `lastRound`'s shape (viewer-only, already filtered) rather than `burnTracks`'s shape (everyone, symmetric). Doc comment should mirror `lastRound`'s: "This player's full match history, each round already filtered to this player's entitlement."

---

### `packages/engine/src/createMatch.ts` (service, CRUD/initialization)

**Analog:** same file — `burnTracks` initialization (lines 90-91, 108)

**Existing pattern to copy** (createMatch.ts:90-91, 108):
```typescript
const burnTracks: Record<string, never[]> = {};
for (const id of playerOrder) burnTracks[id as string] = [];
// ...
return {
  // ...
  burnTracks,
  dossierRespawns: [],
  lastRoundLog: [],
  signals: Object.fromEntries(playerOrder.map((id) => [id as string, []])),
  // ...
};
```

**Pattern to apply:** add a matching `history: Record<string, never[]> = {}` init loop over `playerOrder`, and include `history` in the returned `GameState` object literal, placed adjacent to `burnTracks`/`lastRoundLog` for reviewability.

---

### `packages/engine/src/resolution/index.ts` (service, event-driven)

**Analog:** same file — `resolveRound()`, the `draft.lastRoundLog = ctx.log` line (line 62)

**Existing pattern to copy** (index.ts:51-66):
```typescript
upkeep(ctx);

const outcome = checkVictory(draft);
if (outcome) {
  draft.outcome = outcome;
  draft.phase = 'FINISHED';
  emit(ctx, { type: 'MATCH_ENDED', reason: outcome.reason, winners: outcome.winners });
} else {
  draft.phase = 'ORDERS';
}

draft.lastRoundLog = ctx.log;
draft.signals = generateSignals(draft, ctx.log);
draft.pendingOrders = {};

return { state: draft, log: ctx.log };
```

**Pattern to apply (per RESEARCH.md Pattern 1 — CRITICAL, security-relevant):** immediately after `draft.lastRoundLog = ctx.log;`, loop `draft.playerOrder` and call `filterEvents(draft, ctx.log, pid)` — **against `draft`, the just-resolved state, never a later state** — appending the result to `draft.history[pid]`:
```typescript
draft.lastRoundLog = ctx.log;
for (const pid of draft.playerOrder) {
  const filtered = filterEvents(draft, ctx.log, pid); // draft = THIS round's resolved state, not a future one
  const existing = draft.history[pid as string] ?? [];
  draft.history[pid as string] = [...existing, filtered];
}
draft.signals = generateSignals(draft, ctx.log);
draft.pendingOrders = {};
```
Requires importing `filterEvents` from `../fog/filterEvents.js` into `index.ts` (currently not imported there — it's only called from `projectView.ts`). This is the load-bearing correctness fix from RESEARCH.md Pitfall 1/2: filtering must happen once, at round-resolution time, against contemporaneous state, never re-derived later against a newer `GameState`.

---

### `packages/engine/src/fog/projectView.ts` (service, transform/fog boundary — SECURITY-REVIEWED)

**Analog:** same file — `burnTracks` direct-copy block (lines 96-99) and `lastRound: filterEvents(...)` call site (line 115)

**Existing pattern to copy** (projectView.ts:96-99, 113-115):
```typescript
const burnTracks: Record<string, PlayerView['burnTracks'][string]> = {};
for (const id of state.playerOrder) {
  burnTracks[id as string] = (state.burnTracks[id as string] ?? []).map((e) => ({ ...e }));
}
// ...
return {
  // ...
  signals: (state.signals[viewer as string] ?? []).map((s) => ({ ...s })),
  burnTracks,
  lastRound: filterEvents(state, state.lastRoundLog, viewer),
  // ...
};
```

**Pattern to apply (per RESEARCH.md Pattern 2):** `history` is a **direct copy**, not a `filterEvents()` call — because filtering already happened once inside `resolveRound()` (see above). Add, sibling to the `burnTracks` block:
```typescript
const history = (state.history?.[viewer as string] ?? []).map((round) =>
  round.map((e) => ({ ...e })),
);
```
and include `history,` in the returned object, near `lastRound`. Do **not** call `filterEvents()` here for the history field — that would reintroduce Pitfall 1 (re-filtering old rounds against current state). This file is reviewed as a security change per `packages/engine/src/fog/CLAUDE.md` rule 1 — flag this task for extra review scrutiny and keep `packages/engine/tests/fog-leak.test.ts` green (per rule 8, confirm the leak scan reaches the new `history` field).

---

### `apps/web/lib/motion.ts` (utility, transform — NEW FILE)

**Analog:** `apps/web/components/resolution/StepThrough.tsx` — inline `motion`/`useReducedMotion` usage (lines 4, 27-51)

**Existing pattern to copy** (StepThrough.tsx:1-8, 27-51):
```typescript
'use client';

import type { ResolutionEvent } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
// ...

export function StepThrough({ log, round, isFinal }: StepThroughProps) {
  // ...
  const reducedMotion = useReducedMotion();
  // ...
  return (
    // ...
    <motion.li
      key={index}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded border border-[#e2e8f0] px-3 py-2 text-sm text-[#0f172a]"
    >
```

**Pattern to apply (per UI-SPEC.md Motion Contract and RESEARCH.md Architecture Pattern 3):** extract `DURATION`/`EASING` tokens and one or more variant helper functions that already encode the `reducedMotion ? false : {...}` branch, so new components import a ready-made object instead of re-deriving the conditional:
```typescript
// apps/web/lib/motion.ts
export const DURATION = { fast: 0.15, base: 0.25, slow: 0.35 } as const;
export const EASING = { standard: [0.4, 0, 0.2, 1] } as const;

export function fadeSlideUpVariant(reducedMotion: boolean | null) {
  return {
    initial: reducedMotion ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.base, ease: EASING.standard },
  } as const;
}

export function cardFlipVariant(reducedMotion: boolean | null) {
  return {
    initial: reducedMotion ? false : { rotateY: -90, opacity: 0 },
    animate: { rotateY: 0, opacity: 1 },
    transition: { duration: DURATION.slow, ease: EASING.standard },
  } as const;
}
```
No `'use client'` directive needed unless this file itself calls a hook — if `useReducedMotion()` call stays in components and only the variant-building functions live here, this file can be framework-agnostic aside from importing `motion/react` types. Per `apps/web/lib/CLAUDE.md`, this is client-side plumbing, not a component — belongs in `lib/`, not `components/`.

---

### `apps/web/components/resolution/StepThrough.tsx` (component, transform — REFACTOR)

**Analog:** itself, pre-refactor

**Pattern to apply:** replace the inline `reducedMotion ? false : {...}` block with a call to `fadeSlideUpVariant(reducedMotion)` from `../../lib/motion.js`, spread onto the `motion.li`. Behavior must stay byte-identical — `apps/web/lib/stepThrough.test.ts` must stay green (existing test asserts `useReducedMotion` string presence per RESEARCH.md's Validation Architecture table). This is a call-site change only, not a behavior change.

---

### `apps/web/components/resolution/RoundHistoryPanel.tsx` (component, request-response — NEW FILE)

**Analog 1:** `apps/web/components/resolution/StepThrough.tsx` (reused directly for drill-down, per D-03 — no new renderer)
**Analog 2:** `apps/web/components/match/MatchChat.tsx` (list container / expand pattern)

**Pattern to copy from StepThrough's existing call site** (per RESEARCH.md Code Examples, sourced from `apps/web/app/match/[code]/page.tsx:181-189`):
```typescript
import { StepThrough } from './StepThrough.js';

function HistoryRow({ round, log }: { round: number; log: readonly ResolutionEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} aria-label={`Expand round ${round}`}>
        {/* headline text from lib/format.ts's new exported function */}
      </button>
    );
  }
  return <StepThrough log={log} round={round} isFinal={false} />;
}
```

**Core pattern:** reads `view.history` (flat array, per view.ts pattern above), renders one condensed row per round (newest first per UI-SPEC), each row's expand control toggles local `useState` to swap in `<StepThrough log={round} round={n} isFinal={false} />` — `isFinal` is always `false` for historical rounds (only the live in-progress resolution passes `true`, per the existing call site at `apps/web/app/match/[code]/page.tsx:188`). Row entry gets `fadeSlideUpVariant` from `lib/motion.ts` (Motion Contract item 1); expand/collapse gets the same variant applied to a height/opacity wrapper (Motion Contract item 2).

**Empty state:** follow `MatchChat.tsx`'s pattern of an early-return branch for the no-data case, using the Copywriting Contract's defined heading/body ("No rounds yet" / "History fills in once your first round resolves.") rather than a blank list.

---

### `apps/web/components/intel/BurnTrackPanel.tsx` (component, request-response — NEW FILE, NEW DIRECTORY)

**Analog:** `apps/web/components/deck/CardGrid.tsx` (per-item tile rendering with icon/sector) — read for exact structure below; `apps/web/lib/format.ts` (copy-formatting discipline to follow, not duplicate inline)

**Data-read pattern** (per RESEARCH.md Code Examples, sourced from `packages/shared/src/view.ts:133`):
```typescript
const myTrack = view.burnTracks[view.self.id] ?? [];
// entry.sector === null  →  redacted, render icon + round only (D-05)
// entry.sector !== null  →  render icon + 4-letter sector label + round
```

**Core pattern:** map `myTrack` (oldest-to-newest, matching `ctx.ts`'s `appendBurn()` append order — do not reverse) to entry tiles. Each tile independently checks `entry.sector === null`:
- non-redacted: `"{IconType} · {Sector} · Round {N}"` — sector swatch reuses the fixed 4-color palette (RED/BLUE/GOLD/GREEN) from `02-UI-SPEC.md`, same "color is never the only signal" rule as `CardGrid.tsx` (pair color with the uppercase text label, never color alone)
- redacted: `"{IconType} · Round {N}"` — **no swatch, no sector text, no "Redacted" label** (per D-05 — the absence of color *is* the signal, do not synthesize a placeholder)

New entries get `cardFlipVariant` from `lib/motion.ts` on append (Motion Contract item 3, D-06) — trigger this by diffing `myTrack.length` against a ref/previous-render value, or keying the newest entry's `motion.div` so its mount animation fires once.

**Empty state:** "No entries yet" / "Your capability profile appears here the first time you play a card or a passive fires." (Copywriting Contract).

**Directory note:** `apps/web/components/intel/` does not exist yet (RESEARCH.md Pitfall 5, confirmed via `find` this session) — create it fresh. `apps/web/components/CLAUDE.md` already documents it as the expected home for "Burn Track panels (all players including your own), signals log, informant reports, passive-card status, silencer stock."

---

### `apps/web/components/match/MatchIntelDrawer.tsx` (component, request-response — NEW FILE)

**Analog:** `apps/web/components/match/MatchChat.tsx` (entire file — the explicit template named in CONTEXT.md/UI-SPEC)

**Pattern to copy verbatim (structure), sourced from `MatchChat.tsx` in full:**
```typescript
'use client';

// ... imports

const COLLAPSED_LABEL = 'Intel';

export function MatchIntelDrawer({ /* view, ... */ }: MatchIntelDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'history' | 'burnTrack'>('history');
  // unread/new-entry badge count, mirroring useChatStore's `unread`/`markRead` shape

  if (!expanded) {
    return (
      <div className="fixed bottom-4 left-4">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-[#e2e8f0] bg-[#ffffff] px-4 py-2 text-base font-semibold"
        >
          {COLLAPSED_LABEL}
          {/* unread badge, bg-[#2563eb], same pattern as MatchChat's unread span */}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 flex h-96 w-80 flex-col gap-4 rounded border border-[#e2e8f0] bg-[#ffffff] p-6 shadow">
      {/* tab buttons: "History" / "Burn Track", accent border+text on active tab */}
      {tab === 'history' ? <RoundHistoryPanel /* ... */ /> : <BurnTrackPanel /* ... */ />}
    </div>
  );
}
```

**Key deltas from `MatchChat.tsx`:** docks `bottom-4 left-4` (not `right-4`) per UI-SPEC's "never overlap" requirement; adds a two-tab switcher inside the expanded panel (MatchChat has no tabs); expand/collapse gets `fadeSlideUpVariant` from `lib/motion.ts` (Motion Contract item 5 explicitly calls out both `MatchChat` and the new Intel drawer moving onto the shared utility — `MatchChat` currently has zero motion, per its own comment at `MatchChat.tsx:16` "No motion on the expand... POLISH-01's transition pass is Phase 4" — this is that phase, so `MatchChat.tsx` itself also gets edited, see below). Reuses `p-6`/`h-96 w-80` dimensions verbatim from `MatchChat.tsx` per UI-SPEC's explicit "copy `MatchChat.tsx`'s container classes verbatim" instruction.

---

### `apps/web/components/match/MatchChat.tsx` (component, request-response — EDIT, add motion)

**Analog:** itself (pre-motion version, shown in full above) + `StepThrough.tsx` for the motion pattern to apply

**Pattern to apply:** wrap the expand/collapse transition (currently an unconditional `if (!expanded) return (...)` / else-branch swap with no animation) in `fadeSlideUpVariant`/`motion.div` from `apps/web/lib/motion.ts`, per Motion Contract item 5. This directly resolves the comment at `MatchChat.tsx:16` deferring motion to Phase 4. No structural change otherwise — `ChatBody`/`ChatComposer` reuse is untouched.

---

### `apps/web/lib/format.ts` (utility, transform — EDIT, add round-headline formatter)

**Analog:** same file — `eventText()` (lines 47-135) and `orderRejectionText()` (lines 14-16)

**Existing pattern to copy** (format.ts:1-16):
```typescript
import type { ResolutionEvent } from '@berlin/shared';
import { CODENAME_MAX_LENGTH } from './identity.js';

/**
 * The single source of human-readable event/label text — apps/web/lib/CLAUDE.md
 * rule 5: keeping this in one place means the visual string and the
 * screen-reader announcement can never drift apart.
 */

export function orderRejectionText(reason: string): string {
  return `Your order couldn't be submitted — ${reason}. Fix it and resubmit before the timer runs out.`;
}
```

**Pattern to apply:** add an exported `roundHeadline(round: number, log: readonly ResolutionEvent[]): string` function following the priority rule from the UI-SPEC's Copywriting Contract (dossiers extracted → agents burned → contested nodes → "quiet round", joined by "; " if 2 categories apply). Implement by counting `event.type === 'DOSSIER_TAKEN'` / `'AGENT_BURNED'` / `'CONTEST'` occurrences in `log`, matching `eventText()`'s existing switch-based counting style (e.g. `WIRETAP_RESULT`'s `const n = event.results.length` pattern at format.ts:94-96). Must live here, not inline in `RoundHistoryPanel.tsx`, per `apps/web/lib/CLAUDE.md` rule 5 and `Don't Hand-Roll` table in RESEARCH.md.

---

## Shared Patterns

### Fog-filtering discipline ("filter once, at the moment of truth")
**Source:** `packages/engine/src/resolution/ctx.ts:114-120` (`appendBurn`, Cutout redaction applied once at append time) and `packages/engine/src/fog/projectView.ts:115` (`filterEvents` sole call site)
**Apply to:** `packages/engine/src/resolution/index.ts` (history append), `packages/engine/src/fog/projectView.ts` (history direct-copy)
```typescript
// Redact/filter once, at the moment the fact becomes true — never re-derive
// later against a GameState that postdates the fact. ctx.ts's appendBurn()
// and this phase's history-append follow the identical discipline.
```

### View-by-construction, never by deletion
**Source:** `packages/engine/src/fog/projectView.ts` file-level doc comment (lines 15-22)
**Apply to:** any edit to `projectView.ts` — the new `history` field must be added to the empty-object-then-populate flow the function already uses, never via cloning `GameState` and stripping fields.

### Corner-dock component template
**Source:** `apps/web/components/match/MatchChat.tsx` (full file)
**Apply to:** `MatchIntelDrawer.tsx` — collapsed/expanded `useState`, `fixed bottom-4 {side}-4` positioning, `min-h-11 min-w-11` tap targets, unread-badge treatment (`bg-[#2563eb] rounded-full`), `h-96 w-80 p-6` expanded panel dimensions.

### Reduced-motion single source of truth
**Source:** `apps/web/components/resolution/StepThrough.tsx:36,48` (`useReducedMotion()` + `initial={reducedMotion ? false : {...}}`)
**Apply to:** every new transform-based animation this phase (`RoundHistoryPanel.tsx` row entry/expand, `BurnTrackPanel.tsx` card-flip call-out, `MatchIntelDrawer.tsx`/`MatchChat.tsx` expand-collapse, `CardGrid.tsx` tile flip) — all routed through `apps/web/lib/motion.ts`'s variant helpers, never a second inline `reducedMotion ? false : {...}` branch.

### Single source of human-readable copy
**Source:** `apps/web/lib/format.ts` (`eventText()`, `orderRejectionText()`)
**Apply to:** `RoundHistoryPanel.tsx`'s row headline — implemented as a new exported function in `format.ts`, not inline JSX string-building, per `apps/web/lib/CLAUDE.md` rule 5.

## No Analog Found

None — every file in scope has a strong (exact or role-match) analog in the existing codebase.

## Metadata

**Analog search scope:** `packages/shared/src/`, `packages/engine/src/{resolution,fog}/`, `apps/web/{components,lib}/`
**Files scanned:** `state.ts`, `view.ts`, `projectView.ts`, `filterEvents.ts` (referenced), `resolution/index.ts`, `resolution/ctx.ts`, `createMatch.ts`, `StepThrough.tsx`, `MatchChat.tsx`, `Button.tsx`, `format.ts`, `apps/web/lib/` directory listing, `apps/web/components/{ui,deck}/` directory listings
**Pattern extraction date:** 2026-09-02
