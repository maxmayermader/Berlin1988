---
phase: 01-playable-skeleton
plan: 01
subsystem: infra
tags: [partykit, nextjs, zod, tailwindv4, websocket, playwright, vitest]

# Dependency graph
requires: []
provides:
  - "packages/shared/src/protocol.ts — the wire protocol (Zod schemas + z.infer types) both apps consume"
  - "apps/party — a running PartyKit match room (state, auth, handlers, broadcast, joinCode) with a `_new` HTTP mint endpoint"
  - "apps/web — a running Next.js app (home, lobby route, socket wrapper, identity, create/join reducer)"
  - "The join-code-as-room-id bootstrapping pattern (mint via HTTP, connect directly to `room: <code>`, rebind via JOIN+token) that every later Phase 1 plan's room connection reuses"
affects: [01-02, 01-03, 01-04, 01-05, 01-06]

actuals:
  tokens: 17400
  tasks: 3
  commits: 5

tech-stack:
  added: [zod@4.4.3, partykit@0.0.115, partysocket@1.3.0, nanoid@6.0.1, next@15.5.23, react@19.2.0, zustand@5.0.15, tailwindcss@4.3.0, "@playwright/test@1.62.1"]
  patterns:
    - "Join-code-is-room-id via a stateless `_new` HTTP mint endpoint (onRequest on a sentinel room id), so the client's first real WebSocket connection can target `room: <minted code>` directly — no cross-room migration needed"
    - "Home-page handshake connection (mint/CREATE or JOIN) is transient; the lobby route opens its own persistent connection and rebinds to the same seat via JOIN's optional `token` field"
    - "Pure reducer (lib/createJoin.ts) returns { state, dispatch } together so 'did this click send anything' is an assertable value, not an implementation detail"
    - "Zod schemas in packages/shared/src/protocol.ts are the single wire-type source; both apps derive TS types via z.infer"

key-files:
  created:
    - packages/shared/src/protocol.ts
    - apps/party/src/room.ts
    - apps/party/src/state.ts
    - apps/party/src/handlers.ts
    - apps/party/src/broadcast.ts
    - apps/party/src/auth.ts
    - apps/party/src/joinCode.ts
    - apps/party/tests/helpers.ts
    - apps/party/tests/join.test.ts
    - apps/party/tests/joinCode.test.ts
    - apps/web/lib/socket.ts
    - apps/web/lib/identity.ts
    - apps/web/lib/createJoin.ts
    - apps/web/components/ui/Button.tsx
    - apps/web/components/home/CreateJoinPanel.tsx
    - apps/web/e2e/home.spec.ts
    - playwright.config.ts
  modified:
    - apps/web/app/page.tsx
    - apps/web/app/lobby/[code]/page.tsx
    - apps/web/next.config.ts
    - apps/web/app/globals.css
    - vitest.config.ts
    - package.json

key-decisions:
  - "Join codes ARE PartyKit room ids. A stateless `_new` sentinel room (onRequest, plain HTTP, CORS-enabled) mints a curated-alphabet code before any WebSocket exists, so the client's first real connection can target `room: <code>` directly and CREATE's handler adopts room.id as the code with no cross-room state migration."
  - "The home page's create/join handshake is a short-lived socket (lib/socket.ts's handshake()); the lobby route opens its own persistent connection and rebinds to the already-created seat via JOIN's optional token field. This is why ClientMessage's JOIN carries an optional token — not decoration, load-bearing for this handoff."
  - "Custom Tailwind v4 @theme tokens must avoid Tailwind's own reserved named-scale keys (xs/sm/md/lg/xl/2xl/3xl under --spacing-*) — they silently override utilities like max-w-xl. UI-SPEC's 4px-multiple spacing scale is already Tailwind's default numeric scale, so no custom spacing theme was needed at all."

patterns-established:
  - "Pattern: mint-then-connect for any future create-a-resource-with-a-server-chosen-id flow in apps/party"
  - "Pattern: pure event-driven state machines in apps/web/lib/*.ts, tested as .test.ts with no DOM; components stay thin renders over them (this plan's <testing_note>, followed by every later Phase 1 plan)"

requirements-completed: [HOME-01, HOME-02]

coverage:
  - id: D1
    description: "CREATE mints a join code and seats the caller as host; a second connection JOINs by code and both connections see two distinct HUMAN seats"
    requirement: "HOME-01"
    verification:
      - kind: integration
        ref: "apps/party/tests/join.test.ts#CREATE mints a code; a second connection JOINs it and both see two seats"
        status: pass
      - kind: integration
        ref: "apps/party/tests/join.test.ts#rejects a JOIN against an unknown code"
        status: pass
    human_judgment: false
  - id: D2
    description: "Join codes are deterministic under a seed, drawn from a 31-symbol unambiguous alphabet, with negligible collision rate at scale"
    requirement: "HOME-01"
    verification:
      - kind: unit
        ref: "apps/party/tests/joinCode.test.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Auto-generated, reviewable Cold War codenames persisted to localStorage, capped at 20 characters on both client and server"
    requirement: "HOME-01"
    verification:
      - kind: unit
        ref: "apps/web/lib/identity.test.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Home create/join client state machine: double-submit guarded, error-recoverable, gates navigation on JOINED alone"
    requirement: "HOME-02"
    verification:
      - kind: unit
        ref: "apps/web/lib/createJoin.test.ts (10 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase 1 Success Criterion 1 end to end: create a game, receive a join code, a second browser enters it and lands in the same lobby seeing both seats; an unknown code shows the exact UI-SPEC error copy without navigating"
    requirement: "HOME-02"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/home.spec.ts (3 tests, chromium)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-21
status: complete
---

# Phase 1 Plan 1: Playable Skeleton — Create/Join Tracer Summary

**Create-a-game-by-code and join-by-code working end to end through a real PartyKit room and a real Next.js app — Zod wire protocol, deterministic join codes, localStorage identity, and a pure client reducer, all proven by a passing two-browser Playwright test.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-20T19:07:00-07:00 (approx.)
- **Completed:** 2026-08-20T19:25:00-07:00
- **Tasks:** 3
- **Files modified:** 37

## Accomplishments

- A player can click Create Game, get a real join code minted by a live PartyKit room, and a second browser typing that code lands in the same lobby with both seats visible — proven by `apps/web/e2e/home.spec.ts` against the actual `pnpm dev` stack, not a mock.
- The wire protocol lives in exactly one place (`packages/shared/src/protocol.ts`), Zod-validated on every inbound frame, with `broadcast.ts` as the sole outbound path.
- Join codes and player codenames are deterministic-under-seed, alphabet-constrained, and length-capped on both sides of the wire.
- The create/join client logic is a pure, DOM-free reducer (`lib/createJoin.ts`) with 10 unit tests covering double-submit guarding, error recovery, and the JOINED-only navigation gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "create a game and join it by code"** — `2d1581f` (feat)
2. **Task 2: Join codes and player identity** — `e5f8bd9` (test, RED) → `9ee673c` (feat, GREEN)
3. **Task 3: Home create/join states and the two-browser E2E** — `8a9d472` (test, RED) → `f906662` (feat, GREEN)

_TDD tasks (2 and 3) each have a test commit preceding their feat commit, per this plan's tdd="true" requirement._

## TDD Gate Compliance

- Task 2: `test(01-01)` at `e5f8bd9` precedes `feat(01-01)` at `9ee673c`. Both `apps/party/tests/joinCode.test.ts` and `apps/web/lib/identity.test.ts` were confirmed to fail (module-not-found) before implementation existed.
- Task 3: `test(01-01)` at `8a9d472` precedes `feat(01-01)` at `f906662`. `apps/web/lib/createJoin.test.ts` was confirmed to fail (module-not-found) before `lib/createJoin.ts` existed on disk.

## Files Created/Modified

- `packages/shared/src/protocol.ts` — Zod wire schemas: `ClientMessage` (CREATE/JOIN), `ServerMessage` (JOINED/ROOM_STATE/ERROR), `LobbySeat`/`LobbySnapshot`
- `apps/party/src/state.ts` — `RoomState`/`RoomSeat`, `toSnapshot()` stripping server-only fields
- `apps/party/src/auth.ts` — `mintToken`, `bindConnection`, `seatFor`, `seatForToken`
- `apps/party/src/joinCode.ts` — `newJoinCode` (nanoid `customRandom` seeded from the engine's `RngState`), `JOIN_CODE_ALPHABET` (31 symbols, no `0/O/1/I/L`)
- `apps/party/src/handlers.ts` — `handleCreate`, `handleJoin` (pure; token-rebind path)
- `apps/party/src/broadcast.ts` — `sendTo`, `sendLobby` (the fog chokepoint)
- `apps/party/src/room.ts` — the `Party.Server`: `_new` mint endpoint (CORS-enabled `onRequest`), `onMessage` dispatch, storage persistence
- `apps/party/tests/helpers.ts`, `apps/party/tests/join.test.ts`, `apps/party/tests/joinCode.test.ts`
- `apps/web/lib/socket.ts` — `mintJoinCode`, `handshake`, `useRoomSocket`, token storage
- `apps/web/lib/identity.ts` — `generateCodename`, `loadIdentity`/`saveIdentity`, storage-injectable
- `apps/web/lib/createJoin.ts`, `apps/web/lib/createJoin.test.ts` — the pure create/join state machine
- `apps/web/components/ui/Button.tsx`, `apps/web/components/home/CreateJoinPanel.tsx`
- `apps/web/app/page.tsx`, `apps/web/app/lobby/[code]/page.tsx`
- `apps/web/e2e/home.spec.ts`, `playwright.config.ts`
- `apps/web/next.config.ts`, `apps/web/app/globals.css` — fixed during Task 3 (see Deviations)

## Decisions Made

- **Join-code-is-room-id, minted via a stateless HTTP endpoint.** The plan's prose left one thing genuinely underspecified: a client can't open a WebSocket to `room: <code>` before it knows the code, but PartyKit addresses rooms only by the id used to connect. Resolved by adding a `_new` sentinel room served over plain HTTP (`onRequest`, not a WebSocket message) that mints a code with no state creation; the client's real connection then targets that code directly, and `handlers.ts`'s CREATE handler adopts `room.id` as the match code with zero cross-room migration. Verified against a real running `partykit dev` process, not just the in-process test harness.
- **Token-based seat rebind for the lobby route's own connection.** Since the home page's handshake connection and the lobby route's persistent connection are two different sockets, `handleJoin` treats a `token` matching an existing seat as a rebind (no new seat consumed) rather than a fresh join. This is why `ClientMessage`'s JOIN variant carries an optional `token` — load-bearing, not decorative.
- **No cross-room fetch needed.** Confirmed via `partykit/server`'s actual type definitions (`Context.parties[name].get(id).fetch()` exists) before designing around it, but the mint-then-connect-directly approach turned out not to need it at all.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `apps/web/next.config.ts` needed a webpack `extensionAlias`**
- **Found during:** Task 3, first real `pnpm dev` + Playwright run
- **Issue:** This repo's convention is explicit `.js`-suffixed relative imports (matching how `packages/*` ship as real ESM, and how `tsc`'s Bundler resolution already treats them). `tsc --build` resolved `'../components/home/CreateJoinPanel.js'` to the `.tsx` file fine, but Next's webpack dev bundler does not do this by default — every route importing a component 500'd with "Module not found".
- **Fix:** Added `webpack(config) { config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }; return config; }` to `next.config.ts`.
- **Files modified:** `apps/web/next.config.ts`
- **Verification:** `pnpm dev` serves `/` with a 200 instead of 500; Playwright suite green.
- **Committed in:** `f906662` (Task 3 commit)

**2. [Rule 1 - Bug] `apps/web/app/globals.css` custom theme tokens collided with Tailwind's reserved names**
- **Found during:** Task 3, debugging a Playwright assertion that found the error paragraph in the DOM but reported it "hidden"
- **Issue:** Custom `--spacing-xs` through `--spacing-3xl` theme keys silently override Tailwind v4's own internal named width/max-width scale — `max-w-xl` was compiling to `max-width: var(--spacing-xl)` = 32px instead of ~36rem, collapsing the whole page to zero-width flex children. No visible error, no console warning — confirmed via `page.evaluate()` bounding-rect inspection and reading the actual compiled CSS.
- **Fix:** Removed the custom `--spacing-*` block entirely (documented why in a comment) — UI-SPEC's 4px-multiple scale is already Tailwind's default numeric spacing scale, so `gap-8`/`px-6`/`py-16` etc. already produced the intended pixel values with no custom theme needed.
- **Files modified:** `apps/web/app/globals.css`
- **Verification:** `page.evaluate()` re-check shows correct bounding rects; all 3 Playwright tests pass.
- **Committed in:** `f906662` (Task 3 commit)

**3. [Rule 3 - Blocking] `apps/party/src/room.ts`'s `_new` mint endpoint needed CORS headers**
- **Found during:** Task 3, first real `pnpm dev` + Playwright run
- **Issue:** `apps/web` (port 3000) and `apps/party` (port 1999) are different origins in local dev. The mint endpoint returned a valid JSON body, but the browser silently blocked reading it cross-origin (no `Access-Control-Allow-Origin` header) — the Create button stuck in its disabled/pending state with no visible error, an unhandled promise rejection surfacing only in the Next.js dev overlay.
- **Fix:** Added `Access-Control-Allow-Origin: *` (plus method/header allowances and an `OPTIONS` preflight response) to the `_new` endpoint's responses — safe here since it returns nothing sensitive, only a fresh unclaimed code. Also added a `try`/`catch` around `CreateJoinPanel`'s network calls so any future failure surfaces as an explicit, retryable error state instead of a silent hang (Rule 2 — missing error handling).
- **Files modified:** `apps/party/src/room.ts`, `apps/web/components/home/CreateJoinPanel.tsx`
- **Verification:** Playwright's real-browser create/join flow passes.
- **Committed in:** `f906662` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All three were required for the tracer to actually work end to end in a real browser rather than only in the in-process test harness — none were scope creep. Auto-mode ran without a checkpoint since all three passed the Rule 1/3 bar (bugs/blockers directly caused by this plan's own new code).

## Known Stubs

None. `RoomState.gameState` stays `null` for the whole of this plan — that's the documented Plan 01-02+ boundary (`LOADOUT`/`IN_GAME` transition), not a stub standing in for missing Task 1-3 work.

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: new-surface | `apps/party/src/room.ts` (`_new` mint endpoint) | Not in this plan's original `<threat_model>` register — a stateless, CORS-open (`Access-Control-Allow-Origin: *`) plain-HTTP endpoint added while resolving the join-code-addressing problem. Returns only a freshly minted, unclaimed 6-character code (no state, no secrets); low severity, but new attack surface worth a line in the register on the next threat-model pass for this app. |

## Issues Encountered

- PartyKit's real room-addressing model (a Durable Object's identity is fixed to whatever room id a client connects with) meant the plan's literal "handlers.ts's CREATE handler mints the code" instruction and "second browser connects by typing that code" requirement couldn't both hold without a bootstrap step. Resolved by the mint-then-connect-directly design above; validated against a real running `partykit dev` process (raw WebSocket smoke tests) before wiring the browser side, catching the design early rather than discovering it via a failing E2E.

## User Setup Required

None — no external service configuration required. `pnpm dev` runs the full local stack (Next.js + PartyKit) with no cloud account.

## Next Phase Readiness

- Wave 1 of Phase 1 is complete and un-blocking: `packages/shared/src/protocol.ts`, the room's phase-gated `RoomState`, and `apps/web/lib/socket.ts` are the spine every later plan in this phase (ready-up, board, orders, resolution, result) extends without modification, per `SKELETON.md`.
- `apps/party/src/broadcast.ts` is already the sole outbound path and already documents itself as the fog chokepoint — Plan 01-03's `projectView()` wiring has a clear, single call site to extend.
- No blockers. One note for the next planner: the `_new` mint endpoint is new surface not in the original Phase 1 threat register (see Threat Flags above) — worth a line item if Plan 01-06's security pass runs before this gets folded into a broader review.

---
*Phase: 01-playable-skeleton*
*Completed: 2026-08-21*

## Self-Check: PASSED

All 22 files listed under Files Created/Modified confirmed present on disk. All 5 task/TDD commit hashes (`2d1581f`, `e5f8bd9`, `9ee673c`, `8a9d472`, `f906662`) confirmed present in `git log`.
