---
phase: 03-open-lobbies-host-control-table-talk
verified: 2026-09-02T18:46:38Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: Open Lobbies, Host Control & Table Talk Verification Report

**Phase Goal:** A real group can find each other without trading codes, the host controls the room, everyone can talk, and one person dropping does not kill the match.
**Verified:** 2026-09-02T18:46:38Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Derived from ROADMAP.md's Phase 3 success criteria and the eight requirement IDs (HOME-03, LOBBY-01, LOBBY-02, LOBBY-06, LOBBY-07, CHAT-01, CHAT-02, CHAT-03), each of which maps 1:1 to a `must_haves` block in one of the four plan frontmatters.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A player with no join code can see and one-click join a real open lobby (HOME-03) | ✓ VERIFIED | `apps/party/src/directory.ts` (`LobbyDirectory`), `apps/party/src/directoryClient.ts` (`syncDirectory`, called from every seat/phase-affecting `room.ts` branch), `apps/web/lib/directorySocket.ts`, `apps/web/components/home/OpenLobbies.tsx` reuses `reduce()`/`handshake()`/`storeRoomToken()`/`lobbyPath()` verbatim. `apps/party/tests/directory.test.ts` (18 tests, incl. UPSERT-on-CREATE, self-heal, insertion-order, 400/405 hostile-input rejection) and `apps/web/lib/lobbyList.test.ts` (4 tests) pass. Task 4 human checkpoint (cross-browser, 9 steps) approved per `03-01-SUMMARY.md` and `STATE.md`. |
| 2 | Host can toggle seat count 1-4 before start; a value below the highest occupied index is refused server-side (LOBBY-01) | ✓ VERIFIED | `apps/party/src/state.ts` (`canSetSeatCount`, `minSeatCount`, `setSeatCount` using highest occupied *index*, not count), `apps/party/src/handlers.ts` (`handleSetSeatCount`, host-only via `seatFor`), `apps/web/components/lobby/SeatCountControl.tsx`. `apps/party/tests/seatcount.test.ts` (15 tests) covers the 0/5/3.5/NaN rejection matrix, the seats-0-and-2-occupied gap case, non-host rejection, and a real 1-seat match reaching IN_GAME. |
| 3 | Host can kick a player; the kicked player is redirected home with a dismissible banner and can rejoin via the join code (LOBBY-02) | ✓ VERIFIED | `apps/party/src/handlers.ts` (`handleKick` — non-host/self-kick/OPEN-target/out-of-bounds/wrong-phase all refused), `apps/web/lib/kicked.ts` (one-shot `markKicked`/`consumeKicked`), `apps/web/components/ui/Banner.tsx`, `apps/web/components/home/KickedBanner.tsx`. `apps/party/tests/kick.test.ts` (14 tests, including the CR-01 regression below) and `apps/web/lib/kicked.test.ts` (5 tests) pass. |
| 4 | A kicked or disconnected seat is filled by AI rather than voiding the match, and the match continues to a result (LOBBY-06) | ✓ VERIFIED | `apps/party/src/timers.ts` (`scheduleDisconnectGrace`/`clearDisconnectGrace`/`expiredGraceSeats`, additive-only in `alarmTarget`'s `Math.min`, never touches `deadlineAt`/`deadlineRound`), `apps/party/src/bots.ts` (`takeOverSeat` preserves playerId/token/codename/kind; `reclaimSeat` atomically flips control back and purges stale `botSubmissions`). `apps/party/tests/disconnect.test.ts` (11 tests) and `apps/party/tests/takeover.test.ts` (12 tests, including the overwrite-race regression asserting the *human's* order survives) pass. Task 4 checkpoint (12 steps, incl. clock-untouched observation) approved. |
| 5 | Every AI-controlled seat displays "{Name} the {Title}", not a bare AI badge or difficulty label (LOBBY-07) | ✓ VERIFIED | `apps/party/src/readout.ts` (`aiReadoutFor`), wired through `toSnapshot` → `lobbySeatSchema.aiReadout` → `seatRows()` → `SeatList.tsx`'s `SeatRowBody`. `apps/party/tests/botfill.test.ts` extension asserts the exact string `Katja Reiner the Ghost`; `apps/web/lib/seatRows.test.ts` asserts two same-personality seats render two independent rows. Diacritic (`Marek Doležal`) confirmed at Task 4 checkpoint step A. |
| 6 | Players can send free-text chat in the lobby and it reaches everyone, attributed to the sender's codename (CHAT-01) | ✓ VERIFIED | `apps/party/src/handlers.ts` (`handleChatSend` resolves codename via `seatFor`, never from the message body — `CHAT_SEND` schema has no identity field), `apps/party/src/broadcast.ts` (`sendChat` — single-payload, identical-to-everyone fan-out, no `seatFor` call in the send loop). `apps/party/tests/chat.test.ts` (28 tests) includes a three-connection byte-identity assertion and an extra-key schema-rejection assertion. |
| 7 | Players can send free-text chat during a live match, in a separate log from the lobby (CHAT-02) | ✓ VERIFIED | `apps/party/src/chat.ts` (`chatScopeFor` maps LOBBY/LOADOUT→LOBBY, IN_GAME/ENDED→MATCH; `appendChat` bounds each log at `CHAT_LOG_LIMIT`), `apps/web/components/match/MatchChat.tsx` (collapsed corner drawer, never inside an early-return branch). Tests assert the lobby log does not carry into `state.chat.MATCH` after `startMatch`, and a joining/reconnecting connection receives the correct scope via `CHAT_HISTORY`. |
| 8 | Players can send predefined Cold War flavor prompts in both lobby and match, indistinguishable from free text (CHAT-03) | ✓ VERIFIED | `packages/shared/src/prompts.ts` (`FLAVOR_PROMPTS`, hand-authored, `promptText(id)`), `CHAT_SEND`'s `.superRefine()` enforcing exactly one of `text`/`promptId`, server-side text resolution converges to one `ChatMessage` shape. Tests assert an out-of-range `promptId` is rejected, both-present/both-absent fail schema parsing, and a prompt-sourced message has the same field set as a free-text one. |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/party/src/directory.ts` | `LobbyDirectory` Party.Server | ✓ VERIFIED | Real implementation: strict-schema onRequest, insertion-order Map, onConnect snapshot send |
| `apps/party/src/directoryClient.ts` | `syncDirectory` | ✓ VERIFIED | Phase-derived UPSERT/REMOVE, swallowing try/catch for onAlarm limitation |
| `apps/web/lib/directorySocket.ts` | `useDirectorySocket` | ✓ VERIFIED | connected/everConnected flags, never clears lobbies on close |
| `apps/web/lib/lobbyList.ts` | `lobbyRows`, copy constants | ✓ VERIFIED | Pure view model, no React import, order-preserving |
| `apps/web/components/home/OpenLobbies.tsx` | Home-page list | ✓ VERIFIED | Wired: reuses `reduce`/`handshake`/`storeRoomToken`/`lobbyPath`, mounted in `app/page.tsx` |
| `apps/web/components/lobby/SeatCountControl.tsx` | Host seat-count control | ✓ VERIFIED | Mounted in `app/lobby/[code]/page.tsx`, sends `SET_SEAT_COUNT` |
| `apps/web/components/ui/Banner.tsx` | Kicked-banner primitive | ✓ VERIFIED | Destructive stripe-only, `aria-label="Dismiss"`, no `@berlin/engine`/`@berlin/shared` import |
| `apps/web/lib/kicked.ts` | One-shot flag | ✓ VERIFIED | `markKicked`/`consumeKicked`, injectable `StorageLike`, null-safe |
| `packages/shared/src/prompts.ts` | `FLAVOR_PROMPTS` | ✓ VERIFIED | Hand-authored 10-line list, re-exported from `packages/shared/src/index.ts` |
| `apps/party/src/chat.ts` | Chat log helpers | ✓ VERIFIED | `chatScopeFor`, `appendChat` with `CHAT_LOG_LIMIT` trim, `chatLogFor` |
| `apps/web/components/lobby/ChatPanel.tsx` | Lobby chat panel | ✓ VERIFIED | Extracted `ChatBody`/`ChatComposer` shared with `MatchChat.tsx`, no duplicated prompt list |
| `apps/web/components/match/MatchChat.tsx` | Match chat drawer | ✓ VERIFIED | Collapsed-by-default, fixed corner, mounted once outside early-return branches |
| `apps/party/src/readout.ts` | `aiReadoutFor` | ✓ VERIFIED | Own module (avoids state.ts↔bots.ts import cycle), exact string match confirmed by test |
| `apps/party/tests/directory.test.ts`, `seatcount.test.ts`, `kick.test.ts`, `chat.test.ts`, `disconnect.test.ts`, `takeover.test.ts` | Behavior coverage | ✓ VERIFIED | All present, all green (18/15/14/28/11/12 tests respectively) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `MatchRoom.pushDirectory()` | `LobbyDirectory` | cross-party `fetch()` | ✓ WIRED | Called from CREATE, JOIN, SET_READY, SET_CODENAME, SET_SEAT_COUNT, KICK, both onAlarm branches, and unconditionally from SUBMIT_ORDER as self-heal — confirmed via `grep` of `room.ts` (11 call sites) |
| `handleSetSeatCount`/`handleKick` | `seatFor(state, connectionId)` → `hostPlayerId` compare | host-authority check | ✓ WIRED | Neither reads a client-supplied role flag; confirmed in `handlers.ts` source and by non-host-rejection tests |
| `room.ts KICK branch` | kicked connection → room → directory | `sendTo` then `sendLobby` then `pushDirectory` | ✓ WIRED | Ordering preserved and commented at the call site |
| `socket.ts KICKED dispatch` | `kicked.ts markKicked()` → `router.push('/')` → `page.tsx consumeKicked()` → `Banner` | one inbound path | ✓ WIRED | `socket.ts` contains exactly one `KICKED` branch, no `router`/`next/navigation` import (confirmed by grep) |
| `handleChatSend` | `seatFor(...).codename` | sole attribution source | ✓ WIRED | `CHAT_SEND` schema has no identity field; `handleChatSend` reads only the bound seat |
| `sendChat` | `room.getConnections()` | identical-payload fan-out | ✓ WIRED | One `JSON.stringify`, one loop, no per-recipient branch — confirmed in source and by 3-connection byte-identity test |
| `RoomSeat.controlledBy` | `toSnapshot` → `lobbySeatSchema.aiReadout` → `seatRows()` → `SeatList` | control-mode-to-render path | ✓ WIRED | Confirmed via `SeatRowBody`'s `row.status === 'AI'` branch |
| `room.onClose` | `scheduleDisconnectGrace` → `disconnectedSeats` → `alarmTarget`'s `Math.min` → `onAlarm` → `takeOverSeat` | disconnect chain | ✓ WIRED | Folded into the single alarm slot; confirmed by `disconnect.test.ts` |
| `handleJoin` token-rebind | `reclaimSeat()` | atomic control-flip + purge | ✓ WIRED | One returned object literal, no interleaved await; confirmed by the overwrite-race regression test |

### Behavioral Spot-Checks / Regression Confirmation

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-01 fix (kick clears stale disconnect-grace entry) present in current tree | `git log -1 --format=%H` = `a23d033` (the fix commit); `grep clearDisconnectGrace apps/party/src/handlers.ts` | Fix imported and called at `handleKick`'s vacate step (line 399) | ✓ PASS |
| CR-01 regression test passes | `pnpm test -- kick -t "code review CR-01"` | 1 passed | ✓ PASS |
| Overwrite-race regression (most important test in Plan 04) passes | `pnpm test -- takeover -t "overwrite"` | 1 passed | ✓ PASS |
| Full workspace test suite | `pnpm test` | 39 files, 487 tests, all passed | ✓ PASS |
| Full workspace typecheck | `pnpm typecheck` | exits 0, no output/errors | ✓ PASS |
| No debt markers in phase-touched files | `grep -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all 23 phase-modified core files | zero matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOME-03 | 03-01 | Browse public lobby list, join with a click | ✓ SATISFIED | Directory party + OpenLobbies.tsx, tested + human-checkpointed |
| LOBBY-01 | 03-02 | Host toggles seat count before start | ✓ SATISFIED | `canSetSeatCount`/`setSeatCount`, tested |
| LOBBY-02 | 03-02 | Host kicks a player | ✓ SATISFIED | `handleKick`, tested (incl. CR-01 regression) |
| LOBBY-06 | 03-04 | Kicked/disconnected seat filled by AI, match continues | ✓ SATISFIED | Grace period + takeover, tested + human-checkpointed |
| LOBBY-07 | 03-04 | AI seat shows personality name/title | ✓ SATISFIED | `aiReadoutFor`, tested + human-checkpointed |
| CHAT-01 | 03-03 | Free-text lobby chat | ✓ SATISFIED | `handleChatSend`/`sendChat`, tested |
| CHAT-02 | 03-03 | Free-text match chat | ✓ SATISFIED | Phase-scoped logs, `MatchChat.tsx`, tested |
| CHAT-03 | 03-03 | Predefined flavor prompts, lobby + match | ✓ SATISFIED | `FLAVOR_PROMPTS`, `promptId` path, tested |

No orphaned requirements: REQUIREMENTS.md's traceability table lists exactly these 8 IDs for Phase 3, all cross-referenced against a plan's `requirements:` frontmatter field, all marked Complete.

### Anti-Patterns Found

None. Scanned all 23 phase-created/modified core source files (party + web + shared) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` and "coming soon"/"not yet implemented" phrasing — zero matches. No stub `return null`/empty-object patterns found in the reviewed artifacts; all inspected components (`OpenLobbies.tsx`, `SeatList.tsx`, `directory.ts`) contain real logic wired to real state.

The one Critical finding from the phase's own code review (`03-REVIEW.md` CR-01 — kicking a mid-grace-period seat left a stale `disconnectedSeats` entry, causing an unbounded alarm busy-loop and seat mislabeling) was fixed in commit `a23d033`, confirmed present at `HEAD` on the current branch, with a passing regression test. The two Warnings (WR-01: no TTL on abandoned directory entries; WR-02: informational note tied to CR-01, no separate action needed) and one Info (IN-01: `window.confirm` for kick confirmation instead of a themed dialog) are explicitly non-blocking follow-up items per the review itself, not phase-goal blockers.

### Prohibitions (STRIDE register `flagged-unverified` items — informational, not blocking)

The four plans record eight STRIDE-register prohibitions with `disposition: flagged-unverified` (P-3-01 through P-3-04, spanning directory payload widening, chat delivery-shape filtering, disconnect-grace clock tampering, and reclaim response leaking bot inference). Each has a real, tested structural mitigation (`z.strictObject` schemas, single-payload fan-out functions, additive-only alarm candidates, `sendViews`-only reclaim path) plus a standing code comment naming the prohibition. What none of them can prove is that a *future* code change won't reintroduce the violation — this is inherent to the property being asserted (an absence, not a presence) and each plan explicitly flags it "for `/gsd-verify-work`" as a design decision, not an oversight. Not treated as a phase blocker: the mitigations are implemented and tested against everything that exists today.

### Human Verification Required

None. All four plans' `checkpoint:human-verify` gates (03-01 Task 4, 03-02 has none — no checkpoint task in that plan, 03-03 has none — chat's visual states were flagged `human_judgment: true` in its own SUMMARY but no blocking checkpoint task exists in 03-03-PLAN.md, 03-04 Task 4) that did exist were run and approved by the user during execution, confirmed by both the SUMMARY.md files and `STATE.md`'s blocker/decision log. No `<human-check>` blocks were found deferred inside any `auto` task across the four plans (Step 8's harvest scan returned empty). 03-03's D4 coverage item (chat panel visual states — empty log, rejected-send copy, 240-char wrap) is marked `human_judgment: true` in its SUMMARY without a corresponding blocking checkpoint task; this is a minor documentation gap in 03-03's own plan (it should have included a Task 4 checkpoint mirroring 03-01/03-02/03-04's pattern) but does not block phase completion — the underlying behavior (copy constants, `maxLength`, empty-array branch) is code-verified and low-risk (static copy/CSS, not a state-machine invariant).

### Gaps Summary

No gaps. All 8 must-haves (one per requirement ID) are verified with automated test coverage plus, where the plan called for it, an approved human checkpoint. The one blocking code-review finding (CR-01) is fixed and regression-tested in the current codebase, not merely claimed in a SUMMARY. Full test suite (487/487) and typecheck are green at HEAD.

---

_Verified: 2026-09-02T18:46:38Z_
_Verifier: Claude (gsd-verifier)_
