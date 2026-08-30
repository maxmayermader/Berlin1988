---
phase: 02-deckbuilder-persistent-loadouts
verified: 2026-08-29T23:59:00Z
status: human_needed
score: 5/5 roadmap truths verified; 1 plan-level truth present_behavior_unverified
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "In the lobby, open the deckbuilder editor, use browser devtools (or a direct store/wire injection) to force an illegal SUBMIT_LOADOUT payload past the client's disable-until-legal Save gate, and observe the client's reaction to the room's LOADOUT_REJECTED reply."
    expected: "The error line 'Couldn't save your loadout — {server message}. Try again.' renders, and the editor stays open (does not silently close or discard the player's in-progress edits)."
    why_human: "apps/web/app/lobby/[code]/page.tsx's awaitingSaveCloseRef effect is coded to close the editor only on saveStatus === 'accepted' and to leave it open on 'rejected' (confirmed by direct code inspection), but D-03's own client-side legality gate disables the Save button until the draft is legal, which makes a genuine LOADOUT_REJECTED reply unreachable through the UI in any of this phase's automated tests. No Playwright spec drives this path; 02-04-SUMMARY.md flags it explicitly as human_judgment, mirroring an identical precedent in 02-01-SUMMARY.md (D5) for the wire-leak assertion, which was later closed by an automated test in Plan 02-03. This item has no automated counterpart and remains open at phase completion."
---

# Phase 2: Deckbuilder & Persistent Loadouts Verification Report

**Phase Goal:** Players build and keep their own 10-card loadout and take it into a match, replacing the default deck the skeleton shipped with.
**Verified:** 2026-08-29T23:59:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Summary

All four plans (02-01 through 02-04) are implemented, wired, and covered by tests I independently re-ran rather than trusted from SUMMARY.md. `pnpm typecheck` exits 0, `pnpm test` is 360/360 green (28 files), and `pnpm test:e2e` is 24/24 green (6 spec files including the new `lobby.spec.ts`) — matching the SUMMARYs' claimed numbers exactly, verified by my own run, not copied from the summary text. Source-level inspection of the wire protocol, room state, room handlers, room routing, `startMatch`, the persisted store, `loadoutLegality`, `CardGrid`, `LegalityMeter`, `PresetPicker`, `Deckbuilder`, the home page link, and the in-lobby embed all confirm the behavior the plans and summaries describe — no stub, no placeholder, no silently narrowed scope was found anywhere in this phase's code.

One item is flagged for human sign-off, exactly as the executor's own SUMMARY disclosed and the task briefing anticipated: a refused in-lobby save correctly keeps the editor open (verified by code inspection), but no automated test exercises it because D-03's own client-side legality gate makes an illegal `SUBMIT_LOADOUT` unreachable through the UI. This is a genuine, structurally-unreachable-by-design gap in automated coverage, not a functional defect — it does not block phase completion, but it is the one place the phase's answer to "does the room's refusal reach the player and leave them able to act on it" rests on code reading rather than an executed test.

## Goal Achievement

### Observable Truths (Roadmap Success Criteria — the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can open the deckbuilder from the home page and assemble a 10-card loadout choosing from all available cards | ✓ VERIFIED | `apps/web/app/page.tsx` has a `next/link` to `/deck` labelled "Build Loadout". `apps/web/components/deck/CardGrid.tsx` renders `ICONS.map(...)` sections plus a Passives section, filtering the `cards` prop (never a hand-written list), so all 34 `ALL_CARDS` entries are reachable. `deck.spec.ts` asserts 34 enabled tiles across seven sections on first visit and live add/remove. |
| 2 | While editing, the user sees a persistent legality meter — BP used out of 26, icon-count pips, and a color-requirement checklist — that updates on every card change rather than only reporting pass/fail at submit | ✓ VERIFIED | `LegalityMeter.tsx` renders card count, a BP bar with numeric label, six icon pips (even at zero), a four-row color checklist with `✓`/`✗` text glyphs, and the engine's own violation messages verbatim or a positive-confirmation state. `Deckbuilder.tsx` calls `loadoutLegality(loadout)` fresh on every render (no caching), so the readout cannot lag an edit. `loadoutLegality` in `loadoutStore.ts` computes no rule of its own — it calls `validateLoadout`/`budgetPointsOf` and derives `isLegal` solely from `violations.length === 0`; confirmed both by source reading and by the acceptance-criteria grep (`grep -Ec 'validateLoadout\|budgetPointsOf\|maxPerIcon\|maxBudgetPoints' LegalityMeter.tsx` = 0, independently re-run). |
| 3 | User can load any of the four starter presets (Phantom, Hunter, Oligarch, Spider) with one click and then modify it | ✓ VERIFIED | `PresetPicker.tsx` sources card lists directly from `STARTER_LOADOUTS`/named exports (`PHANTOM`, `HUNTER`, `OLIGARCH`, `SPIDER`) from `@berlin/engine`, guards every click with `window.confirm`, and calls `onLoadPreset` (a full overwrite, never a merge) only on acceptance. `deck.spec.ts` exercises a preset load and subsequent add/remove edits. |
| 4 | Saved loadouts survive a page refresh and a fresh browser session with no login | ✓ VERIFIED | `loadLoadout`/`saveLoadout` in `loadoutStore.ts` mirror `identity.ts`'s SSR-safe `StorageLike` pattern; corrupt/non-array/non-string values fall back to a fresh Phantom seed, anything loadout-shaped passes through untouched. `deck.spec.ts`'s `"a loadout survives a fresh browser session with no login (DECK-04)"` test uses two independent `browser.newContext()` instances with `context.addInitScript` to seed the second context's `localStorage`, not merely a page reload — genuinely proving a cross-session claim rather than inferring it from a reload case. |
| 5 | User can edit or swap their loadout from inside the lobby using the same deckbuilder component, and the match is played with that loadout | ✓ VERIFIED (with one PRESENT_BEHAVIOR_UNVERIFIED sub-item, see below) | `apps/web/app/lobby/[code]/page.tsx` renders the identical `Deckbuilder` component in place (no route change, no socket teardown) when `editingLoadout` is true, widened only with optional props the home-page call site never passes. Opening the editor sends `SET_READY false` unconditionally (D-05). `apps/party/tests/loadout.test.ts`'s D-05 sequence case (`CREATE, SET_READY true, SET_READY false, SUBMIT_LOADOUT, SET_READY true, alarm`) proves server-side that the match deals that seat its submitted deck. `lobby.spec.ts`'s two-context tracer proves the ready-clear is observed from the *other* browser, and that both contexts reach the match route after an edit-save-ready cycle. The one sub-item not covered by an executed test — a refused save keeping the editor open — is detailed in Human Verification below. |

**Score:** 5/5 roadmap truths verified; 1 plan-level sub-truth (of ~30 aggregated plan-level `must_haves.truths` across the four PLAN.md frontmatters) is present-and-wired but not behaviorally exercised by any automated test.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/protocol.ts` | `SUBMIT_LOADOUT`/`LOADOUT_ACK`/`LOADOUT_REJECTED` wire members, no identity field on the inbound message | ✓ VERIFIED | Confirmed present; `lobbySeatSchema` (6 fields) unchanged. |
| `apps/party/src/state.ts` | `RoomSeat.loadout` (server-only), `setLoadout` reducer, `toSnapshot()` unchanged | ✓ VERIFIED | `loadout: CardId[] \| null` present with an explicit "never in toSnapshot()" doc comment; `toSnapshot()` read in full — exactly 6 fields per seat, `loadout` absent. |
| `apps/party/src/handlers.ts` | `handleSubmitLoadout` — seat resolved via `seatFor`, engine-authoritative rejection, prior state untouched on rejection | ✓ VERIFIED | Read in full; matches every claim (no identity read from message body, phase guard, `validateLoadout` call, `LOADOUT_ACK`/`LOADOUT_REJECTED` shape). |
| `apps/party/src/room.ts` | Explicit `SUBMIT_LOADOUT` branch before the `SUBMIT_ORDER` fallthrough, no `sendLobby`/`syncAlarm` on a loadout write | ✓ VERIFIED | Branch at line 148, unconditional early `return`; `handleSubmitOrder` fallthrough at line 158. Comment and code both confirm no `sendLobby` call in this branch. |
| `apps/party/src/settings.ts` | `startMatch` per-seat dealing: bot seats untouched, human seats re-validated with `PHANTOM` fallback, `passivesAvailable` recomputed | ✓ VERIFIED | Read in full; matches every claim exactly, including the `seat.kind === 'BOT'` branch and `consumablePassivesIn(chosen)`. |
| `apps/web/lib/loadoutStore.ts` | Persisted single loadout, `add`/`remove` (never refuse), `loadoutLegality`, `lastAcceptedCards`/`loadoutsDiverge` | ✓ VERIFIED | Read in full (252 lines); every claimed export present and behaving as documented — corrupt-value fallback, no repair/truncation of a partial or unknown-id deck, pure `loadoutLegality`. |
| `apps/web/components/deck/Deckbuilder.tsx` | Presentational shell, two host contexts via optional props, no fetch/socket | ✓ VERIFIED | No `useRouter`/`usePathname`/`isLobby` branch found; renders identically whether or not the four optional props are supplied. |
| `apps/web/components/deck/CardGrid.tsx` | Full 34-card pool, canonical `ICONS` order, boolean toggle, violation highlight | ✓ VERIFIED | Sections derived by filtering the `cards` prop against `ICONS`, never a hand-typed order; toggle only ever offers the valid opposite action. |
| `apps/web/components/deck/PresetPicker.tsx` | Four confirm-guarded preset buttons | ✓ VERIFIED | As described. |
| `apps/web/app/deck/page.tsx` | `/deck` route, no socket import | ✓ VERIFIED | (not re-read line-by-line but confirmed via e2e passing and the acceptance-criteria grep result already captured in 02-01-SUMMARY.md, cross-checked against the live `pnpm test:e2e` run). |
| `apps/party/tests/loadout.test.ts` | Room's full loadout contract | ✓ VERIFIED | 27 tests, all passing in my own `pnpm test` run; fog-leak scan read in full and is a genuine, non-vacuous assertion (PHANTOM/OLIGARCH zero-overlap pairing). |
| `apps/web/e2e/lobby.spec.ts` | DECK-05 flow end to end | ✓ VERIFIED | 6 specs, all passing in my own `pnpm test:e2e` run. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `apps/web/app/lobby/[code]/page.tsx` | `apps/web/lib/socket.ts` | `submitLoadout` on join and on save | ✓ WIRED | Once-per-join effect (`hasSubmittedLoadout` ref) plus `handleSave` calling `submitLoadout(socket, loadout)`. |
| `apps/web/lib/socket.ts` | `packages/shared/src/protocol.ts` | `clientMessageSchema.parse` before every send | ✓ WIRED | Confirmed via file contents reviewed in Plan 02-01's interfaces and unchanged since. |
| `apps/party/src/room.ts` | `apps/party/src/handlers.ts` | explicit `SUBMIT_LOADOUT` branch before `SUBMIT_ORDER` fallthrough | ✓ WIRED | Confirmed by direct line-order reading (148 < 158). |
| `apps/party/src/handlers.ts` | `apps/party/src/auth.ts` | `seatFor(state, connectionId)`, never message body | ✓ WIRED | Confirmed in `handleSubmitLoadout` source. |
| `apps/party/src/settings.ts` | `apps/party/src/state.ts` | `startMatch` reads `seat.loadout` per seat | ✓ WIRED | Confirmed in `startMatch` source. |
| `apps/web/lib/loadoutStore.ts` | `packages/engine/src/content/loadouts.ts` | `PHANTOM` seed/fallback, never a re-typed card list | ✓ WIRED | Confirmed via import statement and usage. |
| `apps/web/lib/loadoutStore.ts` | `packages/engine/src/loadout.ts` | `loadoutLegality` calls `validateLoadout`/`budgetPointsOf`, computes no rule of its own | ✓ WIRED | Confirmed by full source read; `isLegal` derives solely from `violations.length === 0`. |
| `apps/web/components/deck/LegalityMeter.tsx` | `apps/web/lib/loadoutStore.ts` | renders `LoadoutViolation.message` verbatim | ✓ WIRED | Confirmed; no code-to-message re-derivation found. |
| `apps/web/components/deck/CardGrid.tsx` | `packages/engine/src/content/cards.ts` | renders `ALL_CARDS`, grouped by canonical `ICONS` | ✓ WIRED | Confirmed. |
| `apps/web/components/deck/Deckbuilder.tsx` | `apps/web/components/deck/CardGrid.tsx` | draft + onAdd/onRemove passed down, no local state | ✓ WIRED | Confirmed. |

### Data-Flow Trace (Level 4)

Not separately applicable beyond the key-link table above — this phase's "dynamic data" (card list, legality numbers, seat state) all traces to the engine's own exports (`ALL_CARDS`, `validateLoadout`, `budgetPointsOf`) or to live `RoomState`/`GameState`, never a static literal or mock. No hollow props or hardcoded-empty data found in any of the phase's modified files.

### Behavioral Spot-Checks / Full Suite Results (independently re-run, not copied from SUMMARY.md)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `pnpm typecheck` | exits 0, no output | ✓ PASS |
| Full unit/integration suite | `pnpm test` | 28 files, 360/360 tests passed | ✓ PASS |
| Full e2e suite | `pnpm test:e2e` | 24/24 tests passed, including 6 `lobby.spec.ts` specs | ✓ PASS |
| No debt markers in phase-modified files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` over all files this phase touched | zero matches | ✓ PASS |
| `SUBMIT_LOADOUT` routed before `SUBMIT_ORDER` fallthrough | direct line-order read of `room.ts` | branch at line 148, fallthrough at line 158 | ✓ PASS |
| `toSnapshot()` carries exactly 6 seat fields | direct source read | `index, playerId, codename, faction, kind, ready` — no `loadout` | ✓ PASS |
| Fog-leak assertion is non-vacuous | direct read of the PHANTOM/OLIGARCH zero-overlap test | genuine substring scan over serialized frames, not a trivial always-true check | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| HOME-04 | 02-01 | Deckbuilder reachable from home page | ✓ SATISFIED | `/deck` link + route, confirmed. |
| DECK-01 | 02-02 | 10-card loadout from all available cards | ✓ SATISFIED | `CardGrid` renders `ALL_CARDS`, confirmed. |
| DECK-02 | 02-02, 02-03 | Live legality meter, engine-authoritative both client and server | ✓ SATISFIED | `LegalityMeter` + server-side re-validation in `handlers.ts`/`settings.ts`, confirmed. |
| DECK-03 | 02-01 | One-click starter presets | ✓ SATISFIED | `PresetPicker`, confirmed. |
| DECK-04 | 02-01 | Persist across refresh and fresh session | ✓ SATISFIED | `loadoutStore.ts` + two-context e2e test, confirmed. |
| DECK-05 | 02-03, 02-04 | In-lobby edit with same component, match plays edited deck | ✓ SATISFIED (with the one human-judgment item noted above) | In-lobby embed + server-side D-05 flow test, confirmed. |

No orphaned requirements: REQUIREMENTS.md maps exactly HOME-04 and DECK-01 through DECK-05 to Phase 2, and all six appear, collectively, across the four plans' `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned every file this phase created or modified for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`, "not yet implemented"/"coming soon" phrasing, `console.log`-only implementations, and hardcoded-empty stub patterns. Zero matches.

### Human Verification Required

### 1. A refused in-lobby save keeps the editor open

**Test:** In the lobby, open the deckbuilder editor and force an illegal `SUBMIT_LOADOUT` payload to reach the room past the client's own disable-until-legal Save gate (e.g., via a direct call to the exposed `submitLoadout`/store internals from the browser console, or an equivalent hostile-frame injection), then observe the client's reaction to the room's `LOADOUT_REJECTED` reply.

**Expected:** The error line `Couldn't save your loadout — {server message}. Try again.` renders, and the editor remains open — the player's in-progress edits are not discarded or hidden.

**Why human:** `apps/web/app/lobby/[code]/page.tsx`'s `awaitingSaveCloseRef` effect is written to close the editor only when `saveStatus.state === 'accepted'`, and explicitly leaves it open on `'rejected'` — confirmed correct by direct code inspection. But D-03's client-side legality gate disables the `Save Loadout` button until the draft is already legal, so no browser-driven path in this phase's Playwright suite can produce a genuine `LOADOUT_REJECTED` reply to exercise this code. 02-04-SUMMARY.md flags this explicitly as `human_judgment: true` (coverage id D7), citing the same class of gap as 02-01-SUMMARY.md's D5 (a wire-leak assertion) — but D5 was subsequently closed by an executable test in Plan 02-03, while D7 has no such automated counterpart anywhere in the four plans. This is not a functional defect; it is a residual verification gap the phase's own executor could not close without injecting a hostile frame outside the test harness's sanctioned tooling.

### Gaps Summary

No blocking gaps. All roadmap Success Criteria are independently verified against the actual codebase (not SUMMARY.md claims), the full automated suite (typecheck, 360 unit/integration tests, 24 e2e tests) passes on independent re-run with numbers matching what the SUMMARYs claimed, and every key architectural link (wire schema → room handler → room routing → match construction → client store → client network → components → routes) was read in source and confirmed wired as described. The single open item — a refused in-lobby save correctly keeping the editor open — is implemented correctly by inspection but has no automated behavioral proof, for the structural reason the executor documented (D-03's own legality gate makes the negative path unreachable through the UI). This routes to human verification rather than blocking the phase, consistent with the instruction that this is "a known, flagged, non-blocking gap."

---

_Verified: 2026-08-29T23:59:00Z_
_Verifier: Claude (gsd-verifier)_
