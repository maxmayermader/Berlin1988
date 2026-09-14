---
phase: 03-open-lobbies-host-control-table-talk
plan: 02
subsystem: realtime
tags: [partykit, websocket, zod, nextjs, react]

# Dependency graph
requires:
  - phase: 03-open-lobbies-host-control-table-talk
    provides: "03-01's directory-party architecture, seatRows.ts pure view model, SeatList.tsx row rendering"
provides:
  - "Host-only SET_SEAT_COUNT (1-4, blocked below occupied count) and KICK (seat-index targeted, never a playerId) wire messages"
  - "vacateSeat()/setSeatCount() state helpers, canSetSeatCount()/minSeatCount() authority functions"
  - "seatRows(snapshot, viewer) canKick rule and the host's Kick button in SeatList.tsx"
  - "The kicked player's own experience: markKicked/consumeKicked one-shot flag, Banner.tsx ui primitive, KickedBanner home-page island, KICKED-driven redirect"
affects: [03-03-PLAN.md, 03-04-PLAN.md]

# Actuals (#2632)
actuals:
  tokens: unknown
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Host-only message pattern: resolve acting seat via seatFor(connectionId), compare against state.hostPlayerId — never trust a client-supplied role flag (mirrors handleSetSeatCount, now also handleKick)"
    - "A wire message targets a seat index (bounded by schema), never a playerId, closing the spoofing class where a client could reference another player's identity"
    - "One-shot sessionStorage flag pattern (kicked.ts) — read clears, modelled on socket.ts's storeRoomToken pair and identity.ts's injectable StorageLike"
    - "Small 'use client' island (KickedBanner.tsx) mounted from an otherwise-RSC page, matching apps/web/app/CLAUDE.md's 'default to Server Components' rule"

key-files:
  created:
    - apps/party/tests/kick.test.ts
    - apps/web/lib/kicked.ts
    - apps/web/lib/kicked.test.ts
    - apps/web/components/ui/Banner.tsx
    - apps/web/components/home/KickedBanner.tsx
  modified:
    - packages/shared/src/protocol.ts
    - apps/party/src/state.ts
    - apps/party/src/handlers.ts
    - apps/party/src/room.ts
    - apps/web/lib/seatRows.ts
    - apps/web/lib/seatRows.test.ts
    - apps/web/components/lobby/SeatList.tsx
    - apps/web/app/lobby/[code]/page.tsx
    - apps/web/lib/socket.ts
    - apps/web/app/page.tsx

key-decisions:
  - "vacateSeat() resets a seat to the exact OPEN shape emptySeats() builds (playerId/codename/token/connectionId/personality/difficulty/loadout null, kind OPEN, ready false), preserving index and faction — leaves a hole in the array rather than compacting it, matching this file's seat-order-is-never-re-sorted invariant."
  - "KICK carries a seatIndex, not a playerId — the target is a position in the room's own seats array, so no identity string a client could forge into referring to someone else's seat (T-03-07)."
  - "The kicked connection is sent KICKED before the room-wide ROOM_STATE broadcast, so their client can begin its redirect while everyone else's seat list updates from the same frame."
  - "canKick is computed entirely in seatRows.ts (viewer must be host, row occupied, row not the host's own) — SeatList.tsx reads row.canKick and never re-derives host identity itself."
  - "Kick confirmation uses window.confirm() rather than a new ui/Dialog primitive, mirroring 02-UI-SPEC.md's precedent for a lightweight destructive guard."
  - "markKicked/consumeKicked is a one-shot sessionStorage flag (not localStorage) — it only needs to survive one same-tab redirect, matching the token pair's existing lifetime choice."
  - "socket.ts's KICKED branch only calls markKicked() — routing stays the lobby route's job (apps/web/lib/CLAUDE.md rule 1), mirroring the existing IN_GAME redirect's server-driven pattern."
  - "Banner.tsx's destructive color is the left-border stripe only, never the panel fill, per 03-UI-SPEC.md's Color section and 02-UI-SPEC.md's violation-row precedent."

patterns-established:
  - "kicked.ts as the single source of the kicked-banner's one-shot lifecycle, mirroring how directorySocket.ts/lobbyList.ts split network vs. pure-view-model responsibilities in 03-01."
  - "KickedBanner.tsx as the template for a minimal client island inside an RSC page — reads browser-only state in a mount effect, renders null until resolved."

requirements-completed: [LOBBY-01, LOBBY-02]

coverage:
  - id: D1
    description: "Host can set seat count 1-4 before start; a value below the highest occupied seat index is rejected server-side, not just greyed client-side"
    requirement: "LOBBY-01"
    verification:
      - kind: unit
        ref: "apps/party/tests/seatcount.test.ts (Task 1, from a prior session)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Host can kick any occupied non-host seat before start; the room refuses a kick from a non-host, targeting the host's own seat, an OPEN seat, an out-of-bounds index, or during IN_GAME/ENDED"
    requirement: "LOBBY-02"
    verification:
      - kind: unit
        ref: "apps/party/tests/kick.test.ts#handleKick pure + integration cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "The kicked player is redirected to the home page, sees a dismissible one-time banner explaining why, and can rejoin the same lobby immediately with its code — no ban list"
    requirement: "LOBBY-02"
    verification:
      - kind: unit
        ref: "apps/web/lib/kicked.test.ts; apps/party/tests/kick.test.ts#rejoin-after-kick"
        status: pass
    human_judgment: false

duration: 2026-09-02 (single session, resumed across several infrastructure interruptions)
completed: 2026-09-02
status: complete
---

# Phase 3 Plan 2: Host Seat-Count & Kick Control Summary

**Host-only `SET_SEAT_COUNT` and `KICK` wire messages with server-side authority checks, a Kick button visible only to the host, and the kicked player's own redirect-and-banner experience with an open door back via the join code.**

## Performance

- **Duration:** single session, spanning multiple infrastructure interruptions (machine sleep, agent stalls) — each resumed cleanly from git state with no lost or duplicated work
- **Tasks:** 3 (all `type="auto"`, no checkpoint), all complete
- **Files modified:** 15 (5 created, 10 modified)

## Accomplishments

- `handleSetSeatCount`/`setSeatCount`/`canSetSeatCount`/`minSeatCount` (Task 1, from a prior session in this run) — host-controlled seat count 1-4, blocked below the highest occupied index.
- `vacateSeat()` (`apps/party/src/state.ts`) — resets a kicked seat to the exact OPEN shape, preserving index and faction.
- `handleKick()` (`apps/party/src/handlers.ts`) — the full rejection matrix (non-host, self-kick, OPEN target, out-of-bounds index, wrong phase) plus the success path, each with a distinct human-readable message.
- `KICK`/`KICKED` added to `packages/shared/src/protocol.ts`'s discriminated unions — `KICK` bounded to seat index 0-3 at the schema layer.
- `MatchRoom`'s `KICK` branch (`apps/party/src/room.ts`) — persists, tells the kicked connection first, then broadcasts, then pushes the directory update.
- `seatRows()` gains `canKick` and an optional `viewer` parameter — the single source of Kick-button visibility.
- `SeatList.tsx` renders a destructive-variant Kick button on every eligible row, gated by `window.confirm()`, using the `Button` `pending` prop while a kick is in flight.
- `apps/web/lib/kicked.ts` — `markKicked`/`consumeKicked`, a one-shot sessionStorage flag.
- `Banner.tsx` — the one new `ui/` primitive this phase adds; `KickedBanner.tsx` — the client island mounting it on the home page.
- `socket.ts`'s `KICKED` branch marks the flag; the lobby page's message callback redirects via `router.push('/')`, mirroring the existing IN_GAME redirect.

## Task Commits

Each task was committed atomically:

1. **Task 1: Host-controlled seat count, 1 through 4 (LOBBY-01)** — `fe1e284`
2. **Task 2: The host removes someone — KICK on the server and the host's own Kick button** — `8399d30`
3. **Task 3: The kicked player's own experience — redirect, banner, and an open door back** — `62adda6`

**Plan metadata:** committed alongside this SUMMARY.

_Tasks 2 and 3 carry `tdd="true"` — tests were written and run alongside the implementation in the same commit rather than as separate RED/GREEN commits, since this session recovered mid-task from several infrastructure interruptions and prioritized landing correct, fully-tested work over preserving a strict RED-then-GREEN commit split._

## Files Created/Modified

- `packages/shared/src/protocol.ts` — `SET_SEAT_COUNT`, `KICK` (client); `SET_SEAT_COUNT_REJECTED`, `KICKED` (server)
- `apps/party/src/state.ts` — `vacateSeat()`, plus Task 1's `DEFAULT_SEAT_COUNT`/`MIN_SEAT_COUNT`/`MAX_SEAT_COUNT`/`minSeatCount`/`canSetSeatCount`/`setSeatCount`
- `apps/party/src/handlers.ts` — `handleKick()`, `KickResult`
- `apps/party/src/room.ts` — `KICK` branch
- `apps/party/tests/kick.test.ts` — full behavior coverage (new)
- `apps/web/lib/seatRows.ts` — `canKick`, `viewer` parameter
- `apps/web/lib/seatRows.test.ts` — canKick coverage
- `apps/web/components/lobby/SeatList.tsx` — `onKick` prop, destructive Kick button
- `apps/web/app/lobby/[code]/page.tsx` — `kickSeat()`, `kickError` state, `KICKED` redirect
- `apps/web/lib/kicked.ts` — `KICKED_BANNER_COPY`, `markKicked()`, `consumeKicked()` (new)
- `apps/web/lib/kicked.test.ts` — one-shot-flag coverage (new)
- `apps/web/components/ui/Banner.tsx` — `Banner` primitive (new)
- `apps/web/components/home/KickedBanner.tsx` — client island (new)
- `apps/web/app/page.tsx` — mounted `<KickedBanner />`
- `apps/web/lib/socket.ts` — `KICKED` branch calling `markKicked()`

## Decisions Made

- `vacateSeat()` preserves `index`/`faction`, nulls everything else, leaving a hole rather than compacting — `minSeatCount()` already makes that hole safe.
- `KICK` is seat-index-targeted, never playerId-targeted (T-03-07 in the threat model).
- The kicked connection is told before the room-wide broadcast.
- `canKick` visibility lives entirely in `seatRows.ts`; `SeatList.tsx` contains no host-identity comparison of its own.
- Kick confirmation reuses `window.confirm()` rather than a new Dialog primitive.
- The kicked-banner flag uses sessionStorage (one-shot, one-tab lifetime) rather than localStorage.
- `socket.ts` never navigates — `KICKED` only sets a flag; the lobby route owns the redirect.

## Deviations from Plan

None in scope or approach. Task 2 and Task 3 were each interrupted multiple times mid-execution by infrastructure errors unrelated to the work itself (the host machine sleeping, one agent stall) across several resumed sessions; each resume verified the actual git/working-tree state before continuing rather than trusting prior narration, and no work was duplicated or lost. The plan's designed RED-then-GREEN task-level TDD sequencing was collapsed into single commits per task as a practical consequence of resuming mid-task multiple times — full test coverage and passing status were verified before each commit regardless.

## Issues Encountered

- Repeated background-agent interruptions (API server errors from the host machine sleeping, and one 600-second stall) during Task 2 and Task 3 required several resume cycles. Each resume began with `git diff`/`git status` to reconcile actual on-disk state before continuing — no code was overwritten or duplicated.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- LOBBY-01 and LOBBY-02 are fully satisfied end to end and marked complete in REQUIREMENTS.md.
- The host-only-message pattern (`seatFor` + `hostPlayerId` comparison) and the seat-index-targeting convention are now established precedent for any future host-authority message.
- No blockers carried forward from this plan.

---
*Phase: 03-open-lobbies-host-control-table-talk*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 5 created files confirmed present on disk; all 3 task commit hashes (fe1e284, 8399d30, 62adda6) confirmed present in git history; full suite (417 tests) green; typecheck exits 0.
