---
phase: 03-open-lobbies-host-control-table-talk
plan: 01
subsystem: realtime
tags: [partykit, websocket, zod, nextjs, react]

# Dependency graph
requires:
  - phase: 01-playable-skeleton
    provides: MatchRoom Party.Server shape, clientMessageSchema/serverMessageSchema conventions, socket.ts handshake/JOIN primitives, createJoin.ts reduce()/lobbyPath()
provides:
  - A second PartyKit party (directory) acting as a singleton registry of open lobbies
  - syncDirectory() cross-party write path called from every seat/phase-affecting MatchRoom branch
  - useDirectorySocket() read-only client feed with connected/everConnected semantics
  - lobbyRows() pure view model for the Open Lobbies list
  - OpenLobbies.tsx home-page component with one-click join reusing the existing JOIN handshake
affects: [03-02-PLAN.md, 03-03-PLAN.md, 03-04-PLAN.md]

# Actuals (#2632)
actuals:
  tokens: 11646
  tasks: 4
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Second Durable Object class (LobbyDirectory) modelled on MatchRoom's onStart/onRequest/persist shape, with onConnect used exactly once for a stateless snapshot send"
    - "Cross-party fetch() write wrapped in a single try/catch that always swallows (room.context.parties is undocumented-unreliable inside onAlarm) with a self-heal on the next inbound message"
    - "z.strictObject schemas as structural enforcement of a data-minimization prohibition (P-3-01), not convention"
    - "Pure view-model module (lobbyList.ts) with zero React/partysocket imports, following seatRows.ts's existing convention"

key-files:
  created:
    - apps/party/src/directory.ts
    - apps/party/src/directoryClient.ts
    - apps/party/tests/directory.test.ts
    - apps/web/lib/directorySocket.ts
    - apps/web/lib/lobbyList.ts
    - apps/web/lib/lobbyList.test.ts
    - apps/web/components/home/OpenLobbies.tsx
  modified:
    - packages/shared/src/protocol.ts
    - apps/party/partykit.json
    - apps/party/src/room.ts
    - apps/party/tests/helpers.ts
    - apps/web/app/page.tsx

key-decisions:
  - "Directory entries are keyed by room code (not host codename) so two lobbies with the same host codename never collide."
  - "pushDirectory() is called from every seat/phase-affecting room.ts branch (CREATE, JOIN, SET_READY, SET_CODENAME, both onAlarm branches) plus unconditionally at the tail of SUBMIT_ORDER as a self-heal for the documented onAlarm room.context.parties unreliability."
  - "A BOT seat counts as filled (kind !== 'OPEN') for seatsFilled purposes — a bot-filled lobby is genuinely not joinable."
  - "directorySocket.ts's close handler never clears the lobbies array — a directory-party outage degrades to stale-but-visible rows rather than an empty/broken home page, while direct code-join keeps working."
  - "directoryEntrySchema/directoryCommandSchema built with z.strictObject so any future field added to the outbound payload without a matching schema change is a parse failure, not a silent leak — structural enforcement of prohibition P-3-01."

patterns-established:
  - "Untrusted-input boundary comment convention: LobbyDirectory.onRequest documents itself as the trust boundary even though its only caller is this project's own code."
  - "lobbyList.ts as the single owner of Open Lobbies' row-shaping strings (hostLabel, seatsLabel, EMPTY_HEADING/BODY, CONNECTING_LABEL), mirroring how createJoin.ts owns UNKNOWN_CODE_MESSAGE."

requirements-completed: [HOME-03]

coverage:
  - id: D1
    description: "A lobby created in one browser session appears as a row in a second session's home-page Open Lobbies list without a join code, and one click joins it via the existing JOIN handshake"
    requirement: "HOME-03"
    verification:
      - kind: unit
        ref: "apps/party/tests/directory.test.ts#UPSERT on CREATE"
        status: pass
      - kind: manual_procedural
        ref: "03-01-PLAN.md Task 4 checkpoint steps 1-6"
        status: pass
    human_judgment: false
  - id: D2
    description: "The list stays true — live seat-count updates on JOIN, no change on a token rebind, and removal at match start with a self-heal for the alarm-context write limitation"
    requirement: "HOME-03"
    verification:
      - kind: unit
        ref: "apps/party/tests/directory.test.ts#seat count / rebind / IN_GAME removal / self-heal cases"
        status: pass
      - kind: manual_procedural
        ref: "03-01-PLAN.md Task 4 checkpoint steps 6-8"
        status: pass
    human_judgment: false
  - id: D3
    description: "Empty, connecting, and stale-but-visible UI states render correctly, and the directory party rejects every malformed command (non-JSON, unknown key, over-length codename, out-of-range seat total) without storing it"
    requirement: "HOME-03"
    verification:
      - kind: unit
        ref: "apps/party/tests/directory.test.ts#input-hardening cases; apps/web/lib/lobbyList.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "03-01-PLAN.md Task 4 checkpoint step 9 (party process stopped, rows stay visible)"
        status: pass
    human_judgment: false

duration: 2026-09-01 (single session, continuation across a checkpoint)
completed: 2026-09-01
status: complete
---

# Phase 3 Plan 1: Live Lobby Directory & One-Click Join Summary

**A second PartyKit party (`directory`) holding a live, code-keyed registry of open lobbies, streamed to the home page over its own WebSocket, with one-click join reusing the existing JOIN handshake unchanged.**

## Performance

- **Duration:** single session, spanning a human-verify checkpoint
- **Tasks:** 4 (3 code tasks + 1 checkpoint), all complete
- **Files modified:** 12 (7 created, 5 modified)

## Accomplishments

- `LobbyDirectory` (`apps/party/src/directory.ts`): a second `Party.Server` Durable Object class, modelled on `MatchRoom`'s onStart/persist shape, holding a `Map<string, DirectoryEntry>` keyed by room code, preserving insertion order across UPSERTs.
- `syncDirectory()` (`apps/party/src/directoryClient.ts`): derives UPSERT (LOBBY/LOADOUT) vs REMOVE (IN_GAME/ENDED) purely from `state.phase`, reaches the directory via cross-party `fetch()`, and never throws — the entire access is wrapped in a swallowing try/catch documenting the `room.context.parties`-inside-`onAlarm` limitation.
- `MatchRoom.pushDirectory()` called from every seat/phase-affecting branch (CREATE, JOIN, SET_READY, SET_CODENAME, both onAlarm branches) plus unconditionally at the tail of SUBMIT_ORDER as a self-heal for a failed alarm-context write.
- `useDirectorySocket()` (`apps/web/lib/directorySocket.ts`): a read-only client feed with `connected`/`everConnected` flags; the lobbies array is deliberately never cleared on socket close, so a directory outage degrades to stale-but-visible rather than broken.
- `lobbyRows()` (`apps/web/lib/lobbyList.ts`): a pure, React-free view model owning all Open Lobbies row-shaping strings (host label, seats label, empty/connecting copy), never sorting/filtering/deduping.
- `OpenLobbies.tsx`: the home-page component rendering connecting/empty/populated states, with Join reusing `reduce()`/`handshake()`/`storeRoomToken()`/`lobbyPath()` from the existing code-join path verbatim.
- `directoryEntrySchema`/`directoryCommandSchema` built with `z.strictObject`, structurally enforcing prohibition P-3-01 (no field beyond code/seatsFilled/seatsTotal/hostCodename can ever reach the wire) and rejecting every hostile-input case (non-JSON, unknown key, over-length codename, out-of-range seat count) with a 400 and no state mutation.
- Human verification (Task 4) confirmed all 9 cross-browser steps behave as written: registration, live seat-count updates, join, removal at match start, and stale-but-visible behavior when the PartyKit process is stopped.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end lobby-shows-up-and-joins tracer** — `c61c3b9` (test), `edb45a0` (feat: directory + syncDirectory + room.ts wiring), `122c0ba` (feat: OpenLobbies list on home page)
2. **Task 2: Live seat-count updates and D-03 removal** — `d4f453f` (test), `2d47a46` (feat: pushDirectory + lobbyList view model)
3. **Task 3: Empty/connecting/stale states and hostile-input hardening** — `4a4b267` (feat: connecting/empty states + directory input validation, both RED-then-GREEN within the commit)
4. **Task 4: Human verification checkpoint** — no code commit; user walked all 9 steps in two real browser sessions and approved.

**Plan metadata:** committed alongside this SUMMARY.

_Note: Task 1 is a `type="tracer"` task and Tasks 2-3 carry `tdd="true"` — RED commits precede their paired GREEN commits._

## Files Created/Modified

- `packages/shared/src/protocol.ts` — `DIRECTORY_PARTY_NAME`, `DIRECTORY_ROOM_ID`, `directoryEntrySchema`, `DirectoryEntry`, `directoryCommandSchema`, `DirectoryCommand`, `serverMessageSchema`'s new `DIRECTORY_STATE` member
- `apps/party/partykit.json` — added `parties.directory`
- `apps/party/src/directory.ts` — `LobbyDirectory` Party.Server (new)
- `apps/party/src/directoryClient.ts` — `syncDirectory()` (new)
- `apps/party/src/room.ts` — `pushDirectory()` and its call sites across CREATE/JOIN/SET_READY/SET_CODENAME/onAlarm/SUBMIT_ORDER
- `apps/party/tests/helpers.ts` — `context.parties` fake stub, `TestRoom.directoryCommands()`, `createTestDirectory()`
- `apps/party/tests/directory.test.ts` — full behavior coverage for Tasks 1-3 (new)
- `apps/web/lib/directorySocket.ts` — `useDirectorySocket()`, `DirectoryFeed` (new)
- `apps/web/lib/lobbyList.ts` — `LobbyRow`, `lobbyRows()`, `EMPTY_HEADING`, `EMPTY_BODY`, `CONNECTING_LABEL` (new)
- `apps/web/lib/lobbyList.test.ts` — view-model unit tests (new)
- `apps/web/components/home/OpenLobbies.tsx` — the home-page list component (new)
- `apps/web/app/page.tsx` — mounted `<OpenLobbies />` below `<CreateJoinPanel />`

## Decisions Made

- Directory entries keyed by room `code`, not host codename, so two lobbies with identical host names never collide (verified by a dedicated test).
- `pushDirectory()` is called from every seat/phase-affecting branch, and unconditionally from `SUBMIT_ORDER`'s tail specifically as a self-heal for `room.context.parties` being documented-unreliable inside `onAlarm` — this closes the one path where a REMOVE could otherwise silently fail to reach the directory.
- A `BOT` seat counts as filled for `seatsFilled` purposes (`kind !== 'OPEN'`), since a bot-auto-filled lobby is genuinely not joinable by a human.
- `directorySocket.ts`'s close handler intentionally never clears `lobbies` — a directory-party outage must not make the home page look broken while direct code-join continues to work.
- `directoryEntrySchema`/`directoryCommandSchema` use Zod's `z.strictObject` so field-widening (prohibition P-3-01) is a parse failure at the schema layer, not a code-review convention.

## Deviations from Plan

None — plan executed exactly as written across all three code tasks. The checkpoint (Task 4) required no code changes; the user's "approved" response after walking all 9 verification steps satisfied it as-is.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Verification ran against `pnpm dev` (local Next.js + PartyKit) only.

## Next Phase Readiness

- HOME-03 is fully satisfied end to end and marked complete in REQUIREMENTS.md.
- The directory-party architecture (second Durable Object, cross-party fetch write path, second client socket) that this plan's tracer proved is now available for 03-02/03-03/03-04 to extend with additional handlers, seat fields, or UI — no further architectural novelty expected in this phase.
- No blockers carried forward from this plan.

---
*Phase: 03-open-lobbies-host-control-table-talk*
*Completed: 2026-09-01*

## Self-Check: PASSED

All 7 created files confirmed present on disk; all 6 task commit hashes (c61c3b9, edb45a0, 122c0ba, d4f453f, 2d47a46, 4a4b267) confirmed present in git history.
