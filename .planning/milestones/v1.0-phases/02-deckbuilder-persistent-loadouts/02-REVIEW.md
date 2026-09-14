---
phase: 02-deckbuilder-persistent-loadouts
reviewed: 2026-08-29T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - packages/shared/src/protocol.ts
  - apps/party/src/state.ts
  - apps/party/src/handlers.ts
  - apps/party/src/room.ts
  - apps/party/src/settings.ts
  - apps/party/tests/botfill.test.ts
  - apps/party/tests/loadout.test.ts
  - apps/party/tests/clock.test.ts
  - apps/party/tests/fog-wire.test.ts
  - apps/web/lib/loadoutStore.ts
  - apps/web/lib/loadoutStore.test.ts
  - apps/web/lib/socket.ts
  - apps/web/components/deck/Deckbuilder.tsx
  - apps/web/components/deck/PresetPicker.tsx
  - apps/web/components/deck/CardGrid.tsx
  - apps/web/components/deck/LegalityMeter.tsx
  - apps/web/app/deck/page.tsx
  - apps/web/app/page.tsx
  - "apps/web/app/lobby/[code]/page.tsx"
  - apps/web/e2e/deck.spec.ts
  - apps/web/e2e/lobby.spec.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 02 builds the full deckbuilder-and-persistent-loadout slice: the `SUBMIT_LOADOUT`/`LOADOUT_ACK`/`LOADOUT_REJECTED` wire triad, a server-only `RoomSeat.loadout` never surfaced in `toSnapshot()`, `startMatch`'s per-seat dealing with a `PHANTOM` fallback, the `/deck` route and its card grid/legality meter, and the in-lobby editor embed. This is a well-defended slice: every one of this phase's own stated security invariants held up under direct inspection —

- **Fog-of-war / hidden-info boundary:** `RoomSeat.loadout` is never read by `toSnapshot()` (only `index`/`playerId`/`codename`/`faction`/`kind`/`ready` are copied); `LobbySeat`/`lobbySeatSchema` have no loadout field to leak through; the pre-existing `PlayerView.OpponentPublicInfo` fog test (`fog-wire.test.ts`) already forbids `loadout`/`passivesAvailable` on an opponent and stays green. No `sendLobby`/broadcast follows a `SUBMIT_LOADOUT` write.
- **Server-side authority:** `handleSubmitLoadout` re-validates every submission via `validateLoadout(message.cards, DEFAULT_RULESET)` before writing anything, and `startMatch` re-validates a stored seat's loadout a second time (defense in depth) with a `PHANTOM` fallback if it no longer validates. Both resolve the acting seat exclusively via `seatFor(connectionId)` — the `SUBMIT_LOADOUT` schema carries no identity field to spoof.
- **Dependency direction / purity:** no `packages/` file was touched by this phase; every file that does game-rule math in `apps/web` (`loadoutLegality`, `budgetPointsOf`) calls straight through to `@berlin/engine`'s own exported functions rather than reimplementing any rule.
- **Phase-01 CR-01 (unguarded `CREATE` clobber):** confirmed still present and unmitigated, but **not touched or worsened by this phase** — `handleCreate`'s signature and `room.ts`'s `CREATE` branch are byte-identical to what Phase 01 shipped. No new interaction between `SUBMIT_LOADOUT`/loadout state and the `CREATE` path was introduced (a `CREATE` replacing an in-progress lobby's `RoomState` wholesale would also silently discard any submitted-but-not-yet-dealt loadouts, but that is an existing consequence of CR-01, not a new defect from this phase). Re-flagging is out of this review's scope per the review brief; noted here only for completeness.

The two real findings below are both genuine, if narrow, robustness gaps introduced by this phase's own new code — not the intended hidden-info or server-authority failures the phase's own threat model was built to catch.

## Warnings

### WR-01: A loadout draft that exceeds the wire schema's 64-card bound crashes the page instead of being reported

**File:** `apps/web/lib/socket.ts:205-209` (`submitLoadout`), reached from `apps/web/app/lobby/[code]/page.tsx:54-58` (the once-per-join auto-submit effect) and `:114-117` (`handleSave`)
**Issue:** `submitLoadout()` calls `clientMessageSchema.parse(message)` — the *throwing* variant of Zod parse, not `safeParse`. `SUBMIT_LOADOUT.cards` is bounded to `.max(64)` in `packages/shared/src/protocol.ts`. `loadLoadout()`/`saveLoadout()` in `loadoutStore.ts` are explicitly documented as "a dumb container, never a repair layer" — `isStringArray()` accepts an array of any length, and neither `loadPreset`/`add`/`remove` nor the hydration path caps the stored draft's size. If the persisted `berlin1988.loadout` value ever holds more than 64 entries (a corrupted write, a stale value from a future schema version, direct devtools/localStorage tampering, or a third-party browser extension), the lobby page's own auto-submit effect throws synchronously and unconditionally the moment `JOINED` lands and the store hydrates — with no `try`/`catch` anywhere on this path. This is a client-only self-DoS (it cannot affect other seats or leak anything), but it directly contradicts this same phase's own stated threat model, which elsewhere (`Deckbuilder.tsx`'s `tryGetCard`-hardened "your loadout" summary, documented in 02-02-SUMMARY.md as "Found during Task 1... would crash the whole `/deck` page instead of reporting the problem") treats exactly this class of tampered-localStorage input as something to defend against, not merely tolerate.
**Fix:**
```ts
// apps/web/lib/socket.ts
export function submitLoadout(socket: PartySocket, cards: readonly CardId[]): void {
  const message: ClientMessage = { type: 'SUBMIT_LOADOUT', cards: [...cards] };
  const parsed = clientMessageSchema.safeParse(message);
  if (!parsed.success) {
    useLoadoutStore.getState().setSaveStatus({
      state: 'rejected',
      message: 'Your stored loadout is corrupted and could not be sent. Try loading a preset.',
    });
    return;
  }
  useLoadoutStore.getState().setSaveStatus({ state: 'pending' });
  socket.send(JSON.stringify(parsed.data));
}
```
Alternatively (or in addition), cap the array at read time in `loadLoadout()` so a corrupted value is treated the same as any other malformed value and reseeded from `PHANTOM`.

### WR-02: `LegalityMeter`'s displayed limits are hardcoded literals, not derived from the ruleset they claim to mirror

**File:** `apps/web/components/deck/LegalityMeter.tsx:10-12`
**Issue:** `LOADOUT_SIZE = 10`, `BUDGET_LIMIT = 26`, and `PER_ICON_LIMIT = 3` are locally hardcoded numeric literals, even though `@berlin/engine` already exports `DEFAULT_RULESET` with the exact same values under `.loadoutSize`, `.maxBudgetPoints`, and `.maxPerIcon` (confirmed in `packages/engine/src/content/rulesets.ts`) — and `loadoutStore.ts`'s own `loadoutLegality()`/`violatingCardIdsFor()` in the same phase *do* read `DEFAULT_RULESET.maxPerIcon` directly rather than hardcoding it. The component's own comment concedes these are "display-only fallbacks matching `DEFAULT_RULESET`'s current values" — but nothing enforces that match going forward. This is a direct instance of the pattern the repo's own root `CLAUDE.md` calls out by name: "Numbers marked 🔧 in the docs are tuning targets, not commitments. Change them in the ruleset object, never inline." `legality.isLegal`/`legality.violations` (the actual pass/fail judgment) are unaffected — they always come from `validateLoadout()` — but the *labels* next to the BP bar, the card-count line, and the per-icon pips would silently start lying (e.g. rendering "10/10 cards" and a maxed-out-looking bar) the moment a future balance pass changes `maxBudgetPoints` or `loadoutSize`, with no compiler or test signal pointing at this file.
**Fix:**
```ts
import { DEFAULT_RULESET } from '@berlin/engine';

const LOADOUT_SIZE = DEFAULT_RULESET.loadoutSize;
const BUDGET_LIMIT = DEFAULT_RULESET.maxBudgetPoints;
const PER_ICON_LIMIT = DEFAULT_RULESET.maxPerIcon;
```

## Info

### IN-01: `RoomPhase.LOADOUT` has no production transition into it

**File:** `apps/party/src/state.ts:20`, `apps/party/src/handlers.ts:321`, `apps/party/src/settings.ts:47`
**Issue:** `setLoadout()` and `startMatch()` both explicitly admit `state.phase === 'LOADOUT'` alongside `'LOBBY'`, and `apps/party/tests/loadout.test.ts` proves this admission by directly mutating `state.phase = 'LOADOUT'` on the live `RoomState` object (there is no other way to reach it — confirmed via `grep` across `apps/party/src/*.ts`: no code path anywhere sets `phase` to `'LOADOUT'`). This is inherited from Phase 01's scaffolding (`state.ts`'s own comment: "kept as a 4-phase shape so Plan 01-02's deckbuilder can fill LOADOUT without a state-machine change") and is explicitly documented as a known, accepted gap in 02-RESEARCH.md's Open Question A3 — not a regression introduced here. Flagging only so it isn't mistaken for exercised, reachable production behavior: today, every real match transitions `LOBBY -> IN_GAME` directly.
**Fix:** No action required for this phase. If a future phase intends a real LOBBY→LOADOUT (loadout-lock) sub-phase, wire an explicit transition and replace the test's direct-mutation technique with one that drives it.

### IN-02: `SECTOR_SWATCH` is duplicated verbatim between two components

**File:** `apps/web/components/deck/Deckbuilder.tsx:15-20`, `apps/web/components/deck/CardGrid.tsx:21-26`
**Issue:** Both files define an identical `Record<Sector, string>` mapping sector names to hex colors, with an identical doc comment above each. A future sector re-theme (or an accessibility-driven palette change) requires remembering to update both copies; missing one produces a silent, inconsistent-looking mismatch between the card grid and the "your loadout" summary rather than a compile error.
**Fix:** Extract to a single shared constant, e.g. `apps/web/lib/sectorSwatch.ts`, and import it from both components.

### IN-03: `DEFAULT_RULESET` is referenced by name in two separate call sites instead of resolved once from match config

**File:** `apps/party/src/handlers.ts:328`, `apps/party/src/settings.ts:70`
**Issue:** Both `handleSubmitLoadout` and `startMatch` call `validateLoadout(cards, DEFAULT_RULESET)` directly, even though `buildMatchConfig()` in the same file already sets `rulesetId: 'default'` as a locked-for-this-phase literal. Functionally identical today (there is only one ruleset in play), but the two validation call sites have no structural link to `rulesetId` — if a later phase makes the ruleset host-configurable, both sites would need to be found and updated independently to resolve the actual ruleset instead of always validating against `DEFAULT_RULESET`, with no test failure pointing at either.
**Fix:** When ruleset selection becomes configurable, introduce a single `resolveRuleset(rulesetId: string): Ruleset` helper (e.g. `RULESETS[rulesetId] ?? DEFAULT_RULESET`) and route both call sites through it rather than importing `DEFAULT_RULESET` directly.

---

_Reviewed: 2026-08-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
