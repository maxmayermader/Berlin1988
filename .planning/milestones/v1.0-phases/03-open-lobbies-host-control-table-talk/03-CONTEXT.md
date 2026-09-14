# Phase 3: Open Lobbies, Host Control & Table Talk - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

A real group can find each other without trading codes, the host controls the room, everyone can talk, and one person dropping does not kill the match. This phase adds: a public lobby browser backed by a new cross-room discovery mechanism (PartyKit rooms are isolated Durable Objects with no shared list today), host seat-count and kick controls (`SEAT_COUNT` is currently hardcoded to 4 in `apps/party/src/state.ts`), disconnect detection with AI takeover and reclaim, an AI seat readout (personality + flavor title), and lobby/match chat (free text + predefined flavor prompts). No round history/Burn Track, no transition/motion polish, no rebalancing — those are Phase 4 or out of scope.

Requirements covered: HOME-03, LOBBY-01, LOBBY-02, LOBBY-06, LOBBY-07, CHAT-01, CHAT-02, CHAT-03.

</domain>

<decisions>
## Implementation Decisions

### Public Lobby Discovery
- **D-01:** A single well-known "directory" PartyKit room (e.g. `lobby-directory`) that every match room registers/unregisters itself with. Home page connects to it (WebSocket) for a live open-lobbies list. — **Reversibility:** costly — every match room's lifecycle transitions (create, seat fill, start, end) must call into the directory room; switching later to a platform room-listing API or a DB-backed registry means rewriting that registration plumbing across `apps/party`.
- **D-02:** Public list metadata per lobby: seat count as "X/Y filled" and host codename. No ready count shown in the list.
- **D-03:** A lobby is removed from the public list the moment its `RoomPhase` leaves `LOBBY`/`LOADOUT` and enters `IN_GAME` (i.e. once the match actually starts) — matches "no mid-match join support," avoids dead links in the list.

### Host Seat-Count & Kick Control
- **D-04:** Host can set seat count freely across 1–4 (not just 2–4) before the match starts, via a lobby control.
- **D-05:** Lowering seat count below the number of currently-occupied seats is blocked client- and server-side — the option is disabled/greyed rather than auto-kicking anyone. No silent ejections from a seat-count change alone.
- **D-06:** A kicked player's client receives a `KICKED` message, is redirected to the home page with a toast ("You were removed from the lobby by the host"), and can rejoin later with the same join code like any new joiner — no per-room ban/kick-list is built this phase.

### Disconnect, AI Takeover & Bot Readout
- **D-07:** Disconnect is detected via PartyKit's `onClose` on the seat's live connection. A grace period timer starts on close (duration is a planner/implementer choice — no specific value locked, in the same spirit as Phase 1 D-04/COUNTDOWN_DURATION_MS being left to the planner absent a source-specified value). If the same seat's token reconnects before the timer expires, the seat is silently reclaimed with no AI takeover. If the timer expires with no reconnect, `fillEmptySeatsWithBots`-style AI takeover fires for that seat, mid-match.
- **D-08:** AI takeover is **not permanent** — if the original human's client reconnects later (even after the grace period / after AI has already taken over), rejoining with their token hands the seat back from AI to human. This is a deliberate divergence from Phase 1 D-11 ("no reconnection handling") and from `fillEmptySeatsWithBots`'s current LOBBY-only, one-way semantics — the resolution/orders pipeline must tolerate a seat's control flipping human↔AI mid-match cleanly (e.g. an in-flight bot-decided order for the current round should not silently double-submit or conflict with a returning human's own order for that same round). — **Reversibility:** costly — every place that currently assumes a seat's control mode is fixed once AI takes over (`RoomSeat.personality`/`difficulty`, bot order submission in `apps/party/src/bots.ts`) needs to support a live handoff; reverting to one-way takeover later is easy, but building the reclaim path is real new state-machine work this phase must not skip.
- **D-09:** Bot seat readout uses `"[Personality name] the [Title]"` flavor text (e.g. "Katja Reiner the Ghost"), not a bare personality id or difficulty label — matches Phase 1 D-07's "no difficulty UI" choice. Titles are documented in `docs/AI_OPPONENTS.md` (e.g. "Katja Reiner — *The Ghost*") but are **not yet present in code** (`packages/ai/src/personalities/index.ts` only has `id`/`name`) — this phase must add a title lookup (either a new field on the personality data or a small id→title map) sourced from `docs/AI_OPPONENTS.md`.

### Chat
- **D-10:** Lobby chat and in-match chat are separate logs, not one continuous thread. Lobby chat history does not carry over once the match starts; in-match chat is its own log for the match's duration.
- **D-11:** Chat messages are attributed to the player's codename only — never agent identity, seat-to-agent mapping, or anything that would open a new fog-of-war surface. Codenames are already public via the lobby seat list, so this adds no new information leak.
- **D-12:** CHAT-03's predefined flavor prompts are a short curated set (~8-10 lines), Cold War themed (in the spirit of the design doc's example "Berlin is nice this time of year"), drafted by Claude during implementation and available in both lobby and in-match chat — not locked line-by-line in this discussion.

### Claude's Discretion
- Grace-period timer duration for disconnect-before-AI-takeover (D-07) — no source artifact specifies one; planner should pick a value in the same spirit as Phase 1's 10s ready-countdown (short enough to feel responsive, long enough to survive a refresh).
- Exact wording/placement of the kicked-player toast (D-06).
- Exact 8-10 flavor prompt lines (D-12) and whether lobby vs. match get identical or slightly different sets.
- Whether the directory room (D-01) needs any dedup/failure-recovery logic beyond straightforward register/unregister calls — left for research/planning to size.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Room & Lobby State
- `apps/party/src/state.ts` — `RoomState`, `RoomSeat`, `RoomPhase`, `SEAT_COUNT` (currently hardcoded 4 — D-04 removes this), `COUNTDOWN_DURATION_MS` pattern to follow for any new grace-period constant (D-07)
- `apps/party/src/handlers.ts` — existing message handler patterns (SUBMIT_LOADOUT/LOADOUT_ACK precedent from Phase 2) to model new KICK/SET_SEAT_COUNT/CHAT/directory-registration messages on
- `apps/party/src/joinCode.ts` — join code generation; rejoin-with-code flow (D-06) reuses this unchanged
- `apps/party/src/bots.ts` — `fillEmptySeatsWithBots`, `BOT_DIFFICULTY` — existing one-way LOBBY-only bot-fill logic that D-08's mid-match reclaim path must extend without breaking
- `apps/party/src/timers.ts` — existing timer/deadline scheduling pattern (`scheduleRoundDeadline`-style write-once guard) to model the D-07 grace-period timer on

### AI Personalities
- `packages/ai/src/personalities/index.ts` — `PERSONALITIES`, `PERSONALITY_IDS`, each entry's `id`/`name` — needs a title field/lookup added per D-09
- `docs/AI_OPPONENTS.md` §4 — the personality roster with each one's "— *The [Title]*" flavor title, the source text for D-09's title lookup

### Prior Phase Decisions
- `.planning/phases/01-playable-skeleton/01-CONTEXT.md` D-04 (COUNTDOWN_DURATION_MS precedent for unspecified timer values), D-07 (fixed-tier bot difficulty, no difficulty UI — carries into D-09's readout), D-09 (codename identity/local-storage pattern — carries into D-11's chat attribution), D-11 (no reconnection handling in Phase 1 — explicitly superseded by D-07/D-08 this phase)
- `.planning/phases/02-deckbuilder-persistent-loadouts/02-CONTEXT.md` — loadout/identity plumbing conventions (Zustand stores, `apps/web/lib/CLAUDE.md` conventions) that any new chat/lobby-list store should follow

### Requirements Traceability
- `.planning/REQUIREMENTS.md` — HOME-03, LOBBY-01, LOBBY-02, LOBBY-06, LOBBY-07, CHAT-01, CHAT-02, CHAT-03 (this phase); MATCH-06/MATCH-07/POLISH-01 explicitly Phase 4, not this phase
- `.planning/ROADMAP.md` "Phase 3" section — goal statement and success criteria this phase must satisfy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/party/src/state.ts`'s `RoomSeat` already has server-only `personality`/`difficulty` fields (never in `toSnapshot()`) — Phase 3 exposes these (or a derived title string) in the snapshot for the first time, per D-09
- `apps/web/lib/identity.ts`'s localStorage pattern and the existing token-rebind seat mechanism (Phase 1) are the direct basis for D-08's reconnect-and-reclaim flow — same token, later time
- `apps/party/src/bots.ts`'s `fillEmptySeatsWithBots` is the starting point for mid-match AI takeover, but currently only runs once at the LOADOUT→IN_GAME transition and treats bot-vs-human as fixed; D-08 requires generalizing this to a live, reversible per-seat control flip

### Established Patterns
- Wire protocol messages follow a request/ack/reject triad (e.g. `SUBMIT_LOADOUT`/`LOADOUT_ACK`/`LOADOUT_REJECTED` from Phase 2) — new messages (KICK, SET_SEAT_COUNT, CHAT_SEND, directory register/list) should follow the same shape
- `RoomPhase` (`LOBBY`/`LOADOUT`/`IN_GAME`/`ENDED`) already exists and is exactly the signal D-03 needs for hiding a lobby from the public list

### Integration Points
- A new `apps/party/src/directory.ts`-style module (or a genuinely separate PartyKit room type) is needed for D-01's registry, plus a new home-page route/component to render the live list
- `apps/party/src/handlers.ts` needs new inbound message handlers for kick, seat-count change, chat send, and reconnect-reclaim
- `apps/web/app/lobby/[code]/page.tsx` needs new UI: seat-count control, kick buttons (host-only), chat panel
- `apps/web/app/match/[code]/page.tsx` needs a chat panel addition for in-match chat (CHAT-02)

</code_context>

<specifics>
## Specific Ideas

- Bot readout example given during discussion: "Katja Reiner the Ghost" — full personality name + docs-sourced title, not an id or difficulty label (D-09).
- Flavor prompt tone example already in REQUIREMENTS.md/PROJECT.md: "Berlin is nice this time of year" — Cold War table-talk register, not generic chat-app canned replies (D-12).

</specifics>

<deferred>
## Deferred Ideas

- **Per-room kick/ban list** — D-06 deliberately leaves a kicked player free to rejoin with the code; a persistent ban list was considered and explicitly not built this phase.
- **Platform room-listing API or DB-backed lobby registry** — alternatives to D-01's directory room; not chosen now, could replace it later if the directory-room approach doesn't scale.
- **Continuous single chat log spanning lobby→match** — considered and rejected in favor of D-10's separate-logs approach.
- **Anonymous/seat-number-only chat attribution** — considered and rejected in favor of D-11's codename attribution.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope.

</deferred>

---

*Phase: 3-Open Lobbies, Host Control & Table Talk*
*Context gathered: 2026-08-31*
