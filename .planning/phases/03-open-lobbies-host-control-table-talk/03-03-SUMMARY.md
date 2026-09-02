---
phase: 03-open-lobbies-host-control-table-talk
plan: 03
subsystem: chat
tags: [zod, zustand, partykit, react, wire-protocol]

# Dependency graph
requires:
  - phase: 03-02
    provides: host-controlled seat count, KICK, and the kicked-player redirect flow this plan's room.ts branches sit alongside
provides:
  - "CHAT_SEND/CHAT_MESSAGE/CHAT_HISTORY/CHAT_REJECTED wire schemas in packages/shared/src/protocol.ts"
  - "Server-resolved codename attribution (handleChatSend, apps/party/src/handlers.ts) — never trusts an identity field from the client"
  - "Room-wide identical-payload fan-out (sendChat) and targeted catch-up (sendChatHistory), apps/party/src/broadcast.ts"
  - "Two phase-scoped, bounded (100-message) chat logs — apps/party/src/chat.ts's chatScopeFor/appendChat/chatLogFor"
  - "packages/shared/src/prompts.ts — FLAVOR_PROMPTS (10 reviewed lines) and promptText(id)"
  - "apps/web/lib/chatStore.ts, apps/web/lib/chatRows.ts — client store and pure view model"
  - "apps/web/components/lobby/ChatPanel.tsx (ChatPanel/ChatBody/ChatComposer) and apps/web/components/match/MatchChat.tsx"
affects: [03-04, phase-04-polish]

# Actuals (#2632)
actuals:
  tokens: 17913
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "z.strictObject on every chat-adjacent schema (chatMessageSchema, CHAT_SEND) so an unreviewed sixth field is a parse failure, not a silent strip"
    - "A single-payload build-parse-stringify-once fan-out (sendChat), mirroring sendClock/sendLobby, as the structural enforcement of 'never vary delivery by recipient'"
    - "chatScopeFor(phase) as the sole authority mapping RoomPhase to ChatScope — the phase machine is what makes D-10's log separation impossible to drift on"
    - "Shared ChatBody/ChatComposer sub-components exported from ChatPanel.tsx and imported by MatchChat.tsx, so the message list and the flavor-prompt picker are never duplicated across the lobby and match surfaces"

key-files:
  created:
    - packages/shared/src/prompts.ts
    - apps/party/src/chat.ts
    - apps/party/tests/chat.test.ts
    - apps/web/lib/chatStore.ts
    - apps/web/lib/chatStore.test.ts
    - apps/web/lib/chatRows.ts
    - apps/web/lib/chatRows.test.ts
    - apps/web/lib/matchChatMount.test.ts
    - apps/web/components/lobby/ChatPanel.tsx
    - apps/web/components/match/MatchChat.tsx
  modified:
    - packages/shared/src/protocol.ts
    - packages/shared/src/index.ts
    - apps/party/src/handlers.ts
    - apps/party/src/broadcast.ts
    - apps/party/src/room.ts
    - apps/party/src/state.ts
    - apps/web/lib/socket.ts
    - "apps/web/app/lobby/[code]/page.tsx"
    - "apps/web/app/match/[code]/page.tsx"

key-decisions:
  - "CHAT_SEND's text/promptId exclusivity is enforced via .superRefine() on the whole discriminatedUnion, not a second 'type: CHAT_SEND' member (which cannot coexist with the first in a union keyed on that field)."
  - "chatMessageSchema and the CHAT_SEND clientMessageSchema member are both z.strictObject — structural enforcement of prohibition P-3-02's payload half and threat T-03-15, beyond what a plain z.object would give."
  - "History catch-up (sendChatHistory) is a targeted sendTo, deliberately not folded into the room-wide sendChat fan-out — it carries the same data every connection already has, so it introduces no per-recipient variation of the kind P-3-02 forbids."
  - "ChatComposer (input + Send + prompt-chip picker) was extracted as its own exported sub-component from ChatPanel.tsx, beyond what the plan's action text literally asked for, specifically to satisfy the acceptance criterion that neither chat surface declares its own copy of the prompt list or composer markup."

patterns-established:
  - "Static-source vitest checks (reading a .ts/.tsx file's own text) continue to stand in for a missing React component-testing stack this phase — used here for sendChat's shape, handleChatSend's identity-blindness, MatchChat's mount point, and the no-duplicated-prompt-list rule."

requirements-completed: [CHAT-01, CHAT-02, CHAT-03]

coverage:
  - id: D1
    description: "A player types a message in the lobby, presses Send, and every connection in that room sees it attributed to the sender's codename (CHAT-01)"
    requirement: CHAT-01
    verification:
      - kind: integration
        ref: "apps/party/tests/chat.test.ts#a player types in the lobby, presses Send, and every other connection sees the message attributed to the sender codename"
        status: pass
      - kind: integration
        ref: "apps/party/tests/chat.test.ts#every connection in the room receives byte-identical CHAT_MESSAGE payloads for the same send"
        status: pass
    human_judgment: false
  - id: D2
    description: "A player sends a message during an in-progress match and every connection sees it; lobby and match chat are two separate, non-carried-over logs (CHAT-02, D-10)"
    requirement: CHAT-02
    verification:
      - kind: integration
        ref: "apps/party/tests/chat.test.ts#two lobby messages, then a match message after startMatch, land in two separate, correctly-sized logs"
        status: pass
      - kind: integration
        ref: "apps/party/tests/chat.test.ts#a connection that reconnects (token rebind) to a room already IN_GAME receives a CHAT_HISTORY frame for the MATCH scope"
        status: pass
    human_judgment: false
  - id: D3
    description: "A player picks a predefined Cold War flavor prompt and it is sent as a message, in both the lobby and an in-progress match (CHAT-03, D-12)"
    requirement: CHAT-03
    verification:
      - kind: integration
        ref: "apps/party/tests/chat.test.ts#a CHAT_SEND carrying a valid promptId and no text produces a broadcast over a real room whose text equals FLAVOR_PROMPTS[0]"
        status: pass
      - kind: unit
        ref: "apps/web/lib/chatRows.test.ts#ChatPanel.tsx and MatchChat.tsx each render PROMPTS_LABEL and neither declares its own FLAVOR_PROMPTS-shaped array"
        status: pass
    human_judgment: false
  - id: D4
    description: "The chat panel's visual/UX states — empty log, rejected send, 240-char cap, newest-at-bottom rendering — match 03-UI-SPEC.md"
    verification: []
    human_judgment: true
    rationale: "Rendered layout, wrapping, and the collapsed-drawer/expand interaction on the match page are visual properties no unit test in this phase's stack (no component-testing framework) can confirm; needs a human UAT pass in a browser."

duration: 20min
completed: 2026-09-02
status: complete
---

# Phase 3 Plan 3: Table Talk Summary

**Lobby and in-match chat over a `CHAT_SEND`/`CHAT_MESSAGE` wire pair, with server-resolved codename attribution, two phase-scoped bounded logs, and a curated 10-line flavor-prompt picker shared by both surfaces.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-02T17:45Z (approx, per STATE.md session continuity)
- **Completed:** 2026-09-02T18:01Z
- **Tasks:** 3
- **Files modified:** 26 (excluding `.planning/`)

## Accomplishments

- End-to-end lobby chat: a `CHAT_SEND` frame with no identity field, resolved server-side to the sender's bound-seat codename, fanned out as one byte-identical `CHAT_MESSAGE` payload to every connection (CHAT-01, D-11).
- Two genuinely separate, bounded (100-message), phase-scoped chat logs (D-10) — `chatScopeFor(phase)` is the single function making the LOBBY/MATCH split a property of the room's own phase machine, and a joining or reconnecting player is caught up via a targeted `CHAT_HISTORY` frame.
- A collapsed-by-default, fixed-corner match chat drawer (`MatchChat.tsx`) that never disturbs the Board/Orders 60/40 split, with an unread-count badge on the collapsed toggle.
- A hand-authored, reviewed, 10-line Cold War flavor-prompt set (`FLAVOR_PROMPTS`) selectable via a bounded integer index — the client can never broadcast prompt text it didn't select from the reviewed list (T-03-17) — available identically in the lobby and mid-match.
- `chatMessageSchema` and the `CHAT_SEND` client schema are both `z.strictObject`, so a sixth payload field (an agent id, a seat index) is a schema-level parse failure — the structural enforcement of prohibition P-3-02's payload half.

## Task Commits

1. **Task 1: End-to-end "someone says something in the lobby and everyone sees it"** - `9d06ba5` (feat)
2. **Task 2: Chat follows the game — the in-match drawer and D-10's two separate logs** - `aea0d09` (feat)
3. **Task 3: The house style — curated flavor prompts and the chat panel's defined states** - `7605ff5` (feat)

_Each task's commit bundles its own `<behavior>`-covering tests alongside the implementation — this plan's tasks were executed and verified as a unit per the project's existing 03-01/03-02 precedent of one commit per task rather than a separate RED/GREEN pair per task._

## Files Created/Modified

- `packages/shared/src/protocol.ts` — `CHAT_TEXT_MAX`, `chatScopeSchema`/`ChatScope`, `chatMessageSchema`/`ChatMessage` (strict), `CHAT_SEND`/`CHAT_MESSAGE`/`CHAT_HISTORY`/`CHAT_REJECTED` wire members
- `packages/shared/src/prompts.ts` — `FLAVOR_PROMPTS`, `promptText`
- `packages/shared/src/index.ts` — barrel gains `./prompts.js`
- `apps/party/src/chat.ts` — `CHAT_LOG_LIMIT`, `chatScopeFor`, `chatLogFor`, `appendChat`
- `apps/party/src/handlers.ts` — `handleChatSend`, `HandlerResult.chatHistory`, prompt/text resolution
- `apps/party/src/broadcast.ts` — `sendChat` (room-wide identical fan-out), `sendChatHistory` (targeted catch-up)
- `apps/party/src/room.ts` — `CHAT_SEND` branch; `chatHistory` sent alongside `CREATE`/`JOIN` replies
- `apps/party/src/state.ts` — `RoomState.chat`
- `apps/party/tests/chat.test.ts` — full behavior + threat-model coverage for all three tasks
- `apps/web/lib/chatStore.ts` / `chatStore.test.ts` — Zustand store, two scopes, unread counter
- `apps/web/lib/chatRows.ts` / `chatRows.test.ts` — pure view model, copy constants, `canSend`
- `apps/web/lib/matchChatMount.test.ts` — static mount-point check (no component-test stack this phase)
- `apps/web/lib/socket.ts` — `CHAT_MESSAGE`/`CHAT_HISTORY` dispatch, `sendChat`, `sendChatPrompt`
- `apps/web/components/lobby/ChatPanel.tsx` — `ChatPanel`, `ChatBody`, `ChatComposer`
- `apps/web/components/match/MatchChat.tsx` — collapsed/expanded match drawer
- `apps/web/app/lobby/[code]/page.tsx` / `apps/web/app/match/[code]/page.tsx` — mount points, chat error wiring

## Decisions Made

- CHAT_SEND's text/promptId exclusivity enforced via `.superRefine()` on the whole `discriminatedUnion` rather than a second union member (impossible under the same discriminator key).
- `chatMessageSchema` and the `CHAT_SEND` client member both built with `z.strictObject` — a deliberate strengthening beyond the plan's literal action text, since this is the first surface in the codebase carrying free-form human text and the extra-field rejection is exactly what the acceptance criteria required.
- `ChatComposer` extracted as its own exported sub-component (not explicitly named in the plan's interface_context, but required by the "neither declares its own copy of the prompt list" acceptance criterion) so the flavor-prompt chip row and Send/input markup live in exactly one place.

## Deviations from Plan

None — plan executed as written. The `ChatComposer` extraction (see Decisions above) is an implementation-detail addition within Task 3's own stated goal ("attach a prompts picker... to the extracted shared body"), not a scope change; no new files outside what Task 3 already named were required beyond that internal factoring.

## Issues Encountered

- Adding the required `chat` field to `RoomState` (Task 2) meant every other `apps/party/tests/*.ts` file's `fixtureState`/`RoomState` literal needed the new field too, or `pnpm typecheck` would fail. Fixed by adding `chat: { LOBBY: [], MATCH: [] }` to `botfill.test.ts`, `directory.test.ts`, `clock.test.ts`, `fog-wire.test.ts`, `kick.test.ts`, `lobby.test.ts`, and `seatcount.test.ts` alongside `chat.test.ts` itself — a mechanical fixture update, not a behavior change, verified by the full 439/439-then-454/454 green suite after each task.

## Next Phase Readiness

- 03-04 (reconnection/reclaim) can rely on `sendChatHistory`'s exact signature (`connection, scope, messages`) — called out as load-bearing in this plan's `interface_context` and unchanged from what was implemented.
- Prohibition P-3-02 stays `flagged-unverified` per the plan's own verification section — `sendChat`'s structural single-payload shape and the three-connection byte-identity test cover the implemented path; nothing here can prove a *future* change won't add a filtered delivery path. Recorded for `/gsd-verify-work`.
- Visual/UX states (empty-log copy, rejected-send inline error, 240-char wrap, collapsed-drawer expand) are implemented per 03-UI-SPEC.md but not automatable without a component-test stack — flagged as `D4` (`human_judgment: true`) above for a UAT pass.

---
*Phase: 03-open-lobbies-host-control-table-talk*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 19 files listed above (created + modified) and all 3 task commits
(`9d06ba5`, `aea0d09`, `7605ff5`) verified present on disk / in `git log`.
