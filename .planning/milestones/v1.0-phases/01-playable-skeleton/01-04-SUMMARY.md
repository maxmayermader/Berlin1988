---
phase: 01-playable-skeleton
plan: 04
subsystem: ui
tags: [nextjs, react, svg, zustand, playwright, vitest, fog-of-war, legalOrders]

# Dependency graph
requires:
  - phase: 01-playable-skeleton
    provides: "Plan 01-03's submit -> seal -> resolve -> project pipeline and the wire dispatcher (lib/socket.ts) this plan's composer submits through"
provides:
  - "The /match/[code] route: connects via lib/socket.ts, shows 'Connecting…' until the first VIEW frame, then the board plus order composer, and an explicit 'Connection lost' terminal state"
  - "lib/board.ts: projectNode/edgePath/adjacentTo/traversalOrder — pure viewBox projection, edge de-duplication, and 4-direction keyboard traversal, proven against a synthetic map and the real DUEL_12 edge list"
  - "components/board/{Board,MapNode,MapEdge,AgentToken,TargetOverlay}: the inline-SVG duel-12 renderer, data-driven with no map-id branch, fog as absence, sector by shape not color, keyboard navigable"
  - "lib/orderDraft.ts: the two-slot order reducer (ACTIONS_PER_AGENT=2) making a third action structurally unrepresentable, plus composerTargets() driving the board's legal-target highlight from the identical legalOrders() answer the composer renders"
  - "components/orders/{OrderComposer,ActionSlot,AgentSwitcher}: slot UI whose option list is exactly legalOrders(view, agentId, prefix) — never a hand-assembled action list — with a server-ack state machine (pending only leaves on ORDER_ACK/ORDER_REJECTED)"
  - "e2e/match.spec.ts: three passing cases — click-composed MOVE+HOLD to a server ack with a fog scan, keyboard arrow-then-Enter producing the same assignment a click would, and a rejected submission returning the composer to editable with the exact UI-SPEC copy"
affects: [01-05, 01-06]

# Actuals (#2632)
actuals:
  tokens: 15548
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Board's keyboard focus is anchored to the viewer's own agent's current node (selectedNodeId prop) and re-synced via effect whenever that changes, rather than an arbitrary array index — arrow-key traversal is meaningless without a semantically correct starting point"
    - "orderDraft.test.ts drives a real PlayerView through createMatch()+projectView() rather than a stub, so the reducer's rules are checked against genuine legality answers — the one deliberate, plan-directed exception to 'apps/web imports no authoritative engine function', scoped to the test file only (never ships in the browser bundle)"
    - "E2E rejection case intercepts SUBMIT_ORDER via page.routeWebSocket() and answers it directly with a synthetic ORDER_REJECTED, proving the composer's own rejection handling without needing to engineer a real illegal order through a UI that only ever offers legalOrders()-sanctioned actions"

key-files:
  created:
    - apps/web/lib/board.test.ts
    - apps/web/lib/orderDraft.test.ts
  modified:
    - apps/web/components/board/Board.tsx
    - apps/web/e2e/match.spec.ts

key-decisions:
  - "Board's initial/re-anchored keyboard focus comes from the selectedNodeId prop (the active agent's real position), not map.nodes[0] — fixes a bug where arrow-key navigation started from an arbitrary array index unrelated to where the player's agent actually stood"
  - "orderDraft.test.ts's use of createMatch/projectView from @berlin/engine is a test-only exception to the plan's grep gate against those imports in apps/web — the gate's intent (per the plan's own T-1-18 threat mitigation) is the browser bundle, and this import never ships to it; verified by re-running the grep excluding *.test.ts files, which returns 0"

patterns-established:
  - "TDD RED/GREEN evidence captured retroactively for a bug found mid-plan: Board.tsx was reverted to its pre-fix (buggy) state, the failing keyboard e2e case was committed and confirmed RED, then the fix was reapplied and committed separately once GREEN was confirmed"

requirements-completed: [MATCH-01, MATCH-02]

coverage:
  - id: D1
    description: "Lobby hands off to /match/[code] the instant the server reports IN_GAME, and the match screen renders the twelve duel-12 node labels and every edge from view.map alone"
    requirement: "MATCH-01"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/match.spec.ts > ready up alone, land on the board, compose and submit a two-action order"
        status: pass
      - kind: unit
        ref: "apps/web/lib/board.test.ts (10 tests, incl. synthetic three-node map + real DUEL_12 edge list)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A player sees only their own agent; no opponent position, safehouse, or trap ever reaches the DOM (fog as absence, not concealment)"
    requirement: "MATCH-01"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/match.spec.ts — single-agent-token count assertion + whole-document scan for any bot seat's agent id"
        status: pass
    human_judgment: false
  - id: D3
    description: "A player fills exactly two slots per living agent from legalOrders()-supplied options, composes them as an ordered pair, and gets a server ack; a third action is structurally unrepresentable"
    requirement: "MATCH-02"
    verification:
      - kind: unit
        ref: "apps/web/lib/orderDraft.test.ts (9 tests: ACTIONS_PER_AGENT, isSubmittable, assignAction overflow/out-of-range, clearSlot, toAgentOrder ordering, legalOrders prefix behavior)"
        status: pass
      - kind: e2e
        ref: "apps/web/e2e/match.spec.ts > ready up alone... (click-composed MOVE+HOLD reaching 'Order locked in.')"
        status: pass
    human_judgment: false
  - id: D4
    description: "Keyboard navigation: arrow keys traverse adjacent nodes from the agent's actual position, Enter selects, producing the identical slot assignment a click would"
    requirement: "MATCH-01"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/match.spec.ts > keyboard: arrow to an adjacent node and press Enter, same as a click would produce"
        status: pass
    human_judgment: false
  - id: D5
    description: "A rejected submission (ORDER_REJECTED) returns the composer to editable with the exact contracted copy, and the player can resubmit"
    requirement: "MATCH-02"
    verification:
      - kind: e2e
        ref: "apps/web/e2e/match.spec.ts > a rejected submission returns the composer to editable with the exact copy"
        status: pass
    human_judgment: false

# Metrics
duration: unknown (session interrupted by usage limit mid-debug, resumed later)
completed: 2026-08-26
status: complete
---

# Phase 01 Plan 04: Board and Order Composer Summary

**The Berlin board renders entirely from `PlayerView.map` with fog as absence, and a player composes a two-action order from `legalOrders()`'s own answers — proven by click, by keyboard, and by a server rejection, all landing a real ack through Plan 01-03's pipeline.**

## Performance

- **Duration:** unknown — this plan spanned two sessions; the first (Task 1 tracer, commit `a8b3ae9`) was interrupted mid-debug of a failing keyboard-nav E2E case by the account's session usage limit, and this session resumed, diagnosed, fixed, and closed it out.
- **Tasks:** 3/3 completed (Task 1 tracer + Task 2 board tests + Task 3 order-draft tests, the last two delivered as test-only follow-up commits since their implementation code had already landed in Task 1's tracer commit)
- **Files modified this session:** 4 (`apps/web/lib/board.test.ts`, `apps/web/lib/orderDraft.test.ts`, `apps/web/e2e/match.spec.ts`, `apps/web/components/board/Board.tsx`) — Task 1's tracer commit (`a8b3ae9`, prior session) touched 15 files

## Accomplishments

- Verified all three of `match.spec.ts`'s E2E cases pass: click-composed order to server ack (with a two-layer fog scan), keyboard-composed order, and a server-rejected order returning the composer to editable with the exact UI-SPEC copy.
- Diagnosed and fixed a real bug in `Board.tsx`: keyboard focus initialized to `map.nodes[0]?.id` (the raw `DUEL_12` array's first entry, `kurfurstendamm`) instead of the viewer's own agent's actual node. Since the host's agent starts at `karl_marx_allee` — the array's *last* entry — arrow-key navigation started from a node unrelated to where the player's agent stood, and `kurfurstendamm` happens to have no `left` neighbour at all, so the keyboard case's `ArrowLeft` press went nowhere.
- Captured genuine RED→GREEN evidence for that fix: reverted `Board.tsx` to its pre-fix state, confirmed the keyboard E2E case fails exactly as the prior session found it, committed the test files in that failing state, then reapplied the fix and confirmed all 6 E2E cases (both spec files) and all 184 unit/integration tests pass before committing the fix separately.
- Confirmed `apps/web/lib/board.test.ts` (10 tests) and `apps/web/lib/orderDraft.test.ts` (9 tests) are genuine, complete suites covering every `<behavior>` row from Task 2 and Task 3 respectively — not partial or stubbed work — against both a synthetic map/view and real `DUEL_12`/`createMatch()` data.
- Re-verified every literal grep acceptance criterion from the plan (no map-id branch, no literal node id, no hidden-element fog, `HIT_TARGET_PX`/`ACTIONS_PER_AGENT` constants present, rejection copy present exactly once, no hand-rolled action-name list in the composer) rather than assuming the prior session's work satisfied them.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "see the board and give one order"** — `a8b3ae9` (feat, prior session) — the full tracer: match route, board renderer, order composer, keyboard nav, and initial E2E case.
2. **Task 2 + Task 3: board and order-draft unit tests, plus their E2E cases** — `f6a367b` (test) — `board.test.ts`, `orderDraft.test.ts`, and the keyboard-nav + rejection E2E cases in `match.spec.ts`. Committed in a deliberately RED state (keyboard case failing) to capture honest before/after evidence for the bug found while verifying it.
3. **Board keyboard-focus bug fix** — `cb0bdf0` (fix) — anchors `Board.tsx`'s keyboard focus to the active agent's real node instead of `map.nodes[0]`; confirmed GREEN across all 184 unit tests and all 6 E2E cases before committing.

**Plan metadata:** not committed — `commit_docs: false` in `.planning/config.json` (SDK skip, intentional; see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Board's keyboard focus anchored to array order instead of the agent's position**
- **Found during:** resuming Task 2's verification (the keyboard E2E case the prior session left failing)
- **Issue:** `Board.tsx` initialized `focusedNodeId` to `map.nodes[0]?.id`, which is `kurfurstendamm` for `DUEL_12` regardless of where any agent actually stands. The host's agent starts at `karl_marx_allee` (the array's last entry, with `x:80,y:58`). `kurfurstendamm`'s only two edges go to `tiergarten` (up) and `tempelhof` (down) — it has no `left` neighbour — so pressing `ArrowLeft` from the wrongly-anchored focus went nowhere, and `Enter` would have selected a node the engine would never offer as a legal move for the agent actually being ordered.
- **Fix:** Initialize `focusedNodeId` from the `selectedNodeId` prop (already passed by `app/match/[code]/page.tsx` as `activeAgent?.nodeId`), and re-anchor it via a `useEffect` on `selectedNodeId` so focus follows the active agent across a round resolving a move or the player switching agents, falling back to `map.nodes[0]?.id` only when no agent is selected yet.
- **Files modified:** `apps/web/components/board/Board.tsx`
- **Commit:** `cb0bdf0`

### Noted, Not Auto-fixed (documented exception)

**2. `orderDraft.test.ts` imports `createMatch`/`projectView` from `@berlin/engine`, which the plan's own Task 1 grep gate nominally forbids anywhere in `apps/web`.** This is not a bug — Task 3's own `<action>` text explicitly directs building the test's `PlayerView` by "driving `createMatch` in the test file and projecting it," and the plan's T-1-18 threat mitigation frames the underlying concern as the *browser bundle* never holding authoritative engine functions, not the test suite (which never ships to a browser). Re-running the plan's grep excluding `*.test.ts` files confirms zero authoritative-engine imports in any production code path (`grep -rE "from '@berlin/engine'" apps/web --include='*.ts' --include='*.tsx' | grep -v '\.test\.ts' | grep -Ec 'createMatch|resolveRound|projectView|submitOrder'` → 0).

### TDD Gate Compliance

The plan requires (per its Task 2/3 acceptance criteria) that `git log --oneline --grep='^test(01-04)'` return a commit preceding the matching `feat(01-04)` commit. That literal ordering is **not achievable** for this plan: Task 1's tracer commit (`a8b3ae9`, prior session) already bundled the full implementation for `board.ts`, `orderDraft.ts`, and every component Tasks 2–3 were meant to test-first, before this session began. This session's `test(01-04)` commit (`f6a367b`) therefore necessarily follows `a8b3ae9`'s `feat`, not precedes it — the strict RED-before-GREEN-commit ordering the acceptance criterion checks for was already foreclosed. What this session *could* and did preserve honestly: the one genuine bug discovered during verification (the keyboard-focus anchor) was captured with real RED→GREEN evidence — test committed failing, then a separate fix commit made it pass — rather than silently folding the fix into the test commit.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: apps/web/lib/board.test.ts
- FOUND: apps/web/lib/orderDraft.test.ts
- FOUND: apps/web/components/board/Board.tsx
- FOUND: apps/web/e2e/match.spec.ts

**Commits verified to exist:**
- FOUND: a8b3ae9
- FOUND: f6a367b
- FOUND: cb0bdf0

**Verification run:**
- `pnpm typecheck` — exit 0
- `pnpm test` — 184/184 tests passed (20 test files)
- `pnpm test:e2e` — 6/6 tests passed (both `home.spec.ts` and `match.spec.ts`)
- All plan-specified grep gates re-run and confirmed (see Deviations for the one documented exception)
