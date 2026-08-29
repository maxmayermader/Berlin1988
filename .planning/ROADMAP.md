# Roadmap: Berlin 1988

## Overview

The rules engine, fog-of-war projection, AI opponents, and shared wire types already exist and are tested (69 green tests across `packages/shared`, `packages/engine`, `packages/ai`). This milestone builds the missing half: the `apps/web` Next.js client and the `apps/party` PartyKit match host that let real people actually play it.

The roadmap is deliberately **walking-skeleton-first**. Phase 1 is not a technical layer — it is the thinnest possible end-to-end game: home page → create or join a lobby by code → ready up → a full 14-round match against AI or other humans → a result screen. It will be ugly, use a single default loadout, and skip chat, the lobby browser, and the Burn Track. That is the point: the fastest possible path to "I can start a lobby and play a real match." Every phase after that layers a complete capability onto a working, playable game rather than assembling parts that only pay off at the end.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Playable Skeleton** - Bare lobby + default loadout + full 14-round match to a result, end to end
- [ ] **Phase 2: Deckbuilder & Persistent Loadouts** - Players bring their own 10-card deck instead of the default
- [ ] **Phase 3: Open Lobbies, Host Control & Table Talk** - Public lobby browser, host seat/kick control, chat, and dropout resilience
- [ ] **Phase 4: Deduction Surfaces & Presentation Polish** - Round history, Burn Track, and consistent motion across the app

## Phase Details

### Phase 1: Playable Skeleton

**Goal**: A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete 14-round match and see a result — minimal styling, one default loadout, no extras.
**Mode:** mvp
**Depends on**: Nothing (engine, AI, and shared protocol already exist and are tested)
**Requirements**: HOME-01, HOME-02, LOBBY-03, LOBBY-04, LOBBY-05, MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05, MATCH-08
**Success Criteria** (what must be TRUE):

  1. User can create a game from the home page and receive a unique join code, and a second browser can enter that code and land in the same lobby.
  2. Players can ready up with every seat's ready state visible to everyone; once at least 50% of filled seats are ready a countdown starts and the match begins, with any empty seats auto-filled by AI opponents.
  3. Each round a player sees the Berlin node-graph map, assigns 2 actions per agent against it, and submits — while every other player sees only a locked-in indicator plus a live "N of M submitted" count and a visible countdown timer, never the order content.
  4. After the round deadline, resolution is presented as a step-through report in the fixed published priority order, and play advances to the next round.
  5. A full 14-round match reaches a result screen that names the winner and explains which condition ended it (dossier extraction, elimination, or round-14 score lead).

**Plans**: 6/6 plans executed
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold both apps, the wire protocol, and create/join a game by code (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Ready-up, the ≥50% countdown, AI auto-fill, and the single match-start transition (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Sealed orders, the 90-second server clock, bot seats, and the wire-level fog test (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — The Berlin board and the two-actions-per-agent order composer (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — The order HUD and the click-to-advance resolution step-through (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-06-PLAN.md — The result screen, the n=4 timing measurement, and the deployed hibernation check (wave 6)

**UI hint**: yes

**Explicitly deferred from this phase** (delivered later, do not build here): the deckbuilder (Phase 2 — this phase hardcodes one default loadout for every seat), the public lobby browser (Phase 3 — code-only join), chat (Phase 3), host seat/kick controls and AI personality readout (Phase 3), round history log and Burn Track (Phase 4), transitions and animation polish (Phase 4).

### Phase 2: Deckbuilder & Persistent Loadouts

**Goal**: Players build and keep their own 10-card loadout and take it into a match, replacing the default deck the skeleton shipped with.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: HOME-04, DECK-01, DECK-02, DECK-03, DECK-04, DECK-05
**Success Criteria** (what must be TRUE):

  1. User can open the deckbuilder from the home page and assemble a 10-card loadout choosing from all available cards.
  2. While editing, the user sees a persistent legality meter — BP used out of 26, icon-count pips, and a color-requirement checklist — that updates on every card change rather than only reporting pass/fail at submit.
  3. User can load any of the four starter presets (Phantom, Hunter, Oligarch, Spider) with one click and then modify it.
  4. Saved loadouts survive a page refresh and a fresh browser session with no login.
  5. User can edit or swap their loadout from inside the lobby using the same deckbuilder component, and the match is played with that loadout.

**Plans**: 2/4 plans executed
**Wave 1**

- [x] 02-01-PLAN.md — The tracer: /deck, the persisted loadout, the SUBMIT_LOADOUT pipe, and per-seat loadouts at match start (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — The card grid and the live legality meter (wave 2)
- [ ] 02-03-PLAN.md — The room never trusts the client: seat scoping, engine-authoritative rejection, match-start integrity (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-04-PLAN.md — The in-lobby deckbuilder, the D-05 ready clear, and the save gate (wave 3)

**UI hint**: yes

### Phase 3: Open Lobbies, Host Control & Table Talk

**Goal**: A real group can find each other without trading codes, the host controls the room, everyone can talk, and one person dropping does not kill the match.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: HOME-03, LOBBY-01, LOBBY-02, LOBBY-06, LOBBY-07, CHAT-01, CHAT-02, CHAT-03
**Success Criteria** (what must be TRUE):

  1. User can browse a live list of open lobbies from the home page and join one with a click, without needing a code.
  2. Host can change the seat count and kick a player before start, and every seated player sees the change immediately.
  3. When a player is kicked or drops mid-match, an AI takes over their seat and the match continues to a result instead of voiding.
  4. Every AI-controlled seat shows the bot's name and personality rather than a bare difficulty label.
  5. Players can send free-text messages and predefined flavor prompts (e.g. "Berlin is nice this time of year") in both the lobby and an in-progress match, and everyone in the room sees them.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Deduction Surfaces & Presentation Polish

**Goal**: Players can reason about what has been revealed across the whole match, and the app stops looking like a prototype.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: MATCH-06, MATCH-07, POLISH-01
**Success Criteria** (what must be TRUE):

  1. Player can open a round history/log and re-read every past resolution in the current match.
  2. Player can open their own Burn Track panel showing exactly what public information opponents have learned about them, updating as each round resolves.
  3. Panel and page transitions, hover states, card flips, and button/loading feedback are applied consistently across the home page, deckbuilder, lobby, and match screens.
  4. With the operating system's reduced-motion preference enabled, that motion is suppressed without breaking any interaction.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Playable Skeleton | 6/6 | In Progress|  |
| 2. Deckbuilder & Persistent Loadouts | 2/4 | In Progress|  |
| 3. Open Lobbies, Host Control & Table Talk | 0/TBD | Not started | - |
| 4. Deduction Surfaces & Presentation Polish | 0/TBD | Not started | - |

## Requirement Coverage

All 28 v1 requirements are mapped to exactly one phase. See `.planning/REQUIREMENTS.md` for the full traceability table.

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | HOME-01, HOME-02, LOBBY-03, LOBBY-04, LOBBY-05, MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05, MATCH-08 | 11 |
| 2 | HOME-04, DECK-01, DECK-02, DECK-03, DECK-04, DECK-05 | 6 |
| 3 | HOME-03, LOBBY-01, LOBBY-02, LOBBY-06, LOBBY-07, CHAT-01, CHAT-02, CHAT-03 | 8 |
| 4 | MATCH-06, MATCH-07, POLISH-01 | 3 |

**Total: 28/28 mapped. No orphans, no duplicates.**

## Research Flags

From `.planning/research/SUMMARY.md` — these land inside Phase 1 because the walking skeleton pulls the highest-risk work forward. Phase 1 planning should account for them:

- **Concurrent 4-player timing** — untested at n=4 (message ordering, queue depth, latency). Local 4-bot live-room measurement recommended before shipping Phase 1.
- **Wire-level fog of war** — `PlayerView` being type-safe is not the same as wire-safe. Broadcast per connection via `projectView()`; add an integration test asserting the literal WebSocket payload carries no opponent agent positions, safehouse, traps, or cooldowns.
- **Resolution step-through timing** — profile the step-through report with 4 concurrent agents and 8–16 events; verify no step reveals information ahead of its rules-defined position.
- **PartyKit hibernation** — never triggers in local dev. Attach per-connection logic in `onMessage`/`onClose`, not `onConnect`, and test idle-then-message behavior against a deployed room.
- **PartyKit hosting location** — undecided per PROJECT.md constraints; must be resolved during Phase 1.
