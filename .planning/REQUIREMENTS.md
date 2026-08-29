# Requirements: Berlin 1988

**Defined:** 2026-08-19
**Core Value:** A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete, playable 14-round match and see a result — with no gaps in the underlying rules engine.

## v1 Requirements

Requirements for initial release (the UI/realtime milestone). Each maps to roadmap phases.

### Home & Navigation

- [x] **HOME-01**: User can create a new game from the home page, receiving a unique join code
- [x] **HOME-02**: User can join a game by entering a join code
- [ ] **HOME-03**: User can browse a public list of open lobbies and join one with a click
- [x] **HOME-04**: User can access the deckbuilder from the home page

### Deckbuilder

- [ ] **DECK-01**: User can build a 10-card loadout choosing from all available cards
- [ ] **DECK-02**: Deckbuilder enforces loadout legality live via a persistent visual meter (BP used/26, icon-count pips, color-requirement checklist) — not just pass/fail at submit time
- [x] **DECK-03**: User can load one of the four starter preset loadouts (Phantom, Hunter, Oligarch, Spider) with one click
- [x] **DECK-04**: User's saved loadouts persist in browser local storage across sessions (no login)
- [ ] **DECK-05**: User can edit their loadout ("class") from within the lobby, using the same deckbuilder component as the home page

### Lobby

- [ ] **LOBBY-01**: Host can toggle game size (seat count) before start
- [ ] **LOBBY-02**: Host can kick a player from the lobby
- [x] **LOBBY-03**: Players can ready up; each seat's ready state is visible to everyone
- [x] **LOBBY-04**: A countdown to start begins automatically once ≥50% of filled seats are ready
- [x] **LOBBY-05**: Host can start a game solo, auto-filling all other seats with AI opponents
- [ ] **LOBBY-06**: A kicked or disconnected player's seat can be filled by AI rather than voiding the match
- [ ] **LOBBY-07**: Each AI-controlled seat displays the bot's name and personality, not just a difficulty label

### Chat

- [ ] **CHAT-01**: Players can send free-text chat messages in the lobby
- [ ] **CHAT-02**: Players can send free-text chat messages during a match
- [ ] **CHAT-03**: Players can send predefined flavor-text chat prompts (e.g. "Berlin is nice this time of year") in addition to free text, in both lobby and match

### In-Match UI

- [x] **MATCH-01**: The match board renders the node-graph map of Berlin as the primary play surface
- [x] **MATCH-02**: Player can assign 2 actions per agent (free moves, Intel-funded Sprints, loadout plays) against the map each round
- [x] **MATCH-03**: Once a player submits orders, other players see only a locked-in indicator — never the order content — before resolution
- [x] **MATCH-04**: Player sees a live count of how many players have submitted orders this round, plus a visible countdown timer, without seeing who or what
- [x] **MATCH-05**: Round resolution is presented as a step-through report in fixed priority order, not a live all-agents-at-once animation. Each individual step may animate (e.g. the affected agent's icon moving to its new position for that one event) as long as it stays sequential and never reveals information ahead of its rules-defined step
- [ ] **MATCH-06**: Player can view a round history/log of past resolutions
- [ ] **MATCH-07**: Player can view their own Burn Track panel showing exactly what public information opponents have learned about them
- [x] **MATCH-08**: On match end, a result screen explains the outcome (dossier extraction, elimination, or round-14 score) and who won

### UI Polish

- [ ] **POLISH-01**: General UI transitions and micro-interactions (panel/page transitions, hover states, card flips, button/loading feedback) applied consistently across lobby, deckbuilder, and match screens, respecting reduced-motion preferences

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Deduction Aids

- **DEDUCE-01**: Post-round "what you learned" digest summarizing Signals-phase information as a compact deduction aid, distinct from the raw resolution log

### Deckbuilder Polish

- **DECK-06**: Archetype-aware deckbuilder hints (e.g. flagging an active/passive imbalance in prose, per the design doc's framing)

### Theming

- **THEME-01**: Full retro CRT/teletype aesthetic pass applied consistently across lobby and deckbuilder chrome (match screen theming is in v1 via MATCH-01)

### Accounts & Beyond

- **MOBILE-01**: Mobile-optimized touch layout for the match screen

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Live/animated simultaneous movement | Genre consensus and the project's own design doc (§7) both specify report-style resolution; live animation of all agents at once is visually incoherent and risks leaking fog-of-war information mid-animation |
| Global matchmaking / skill-based ELO queue | No accounts means no durable identity to attach skill to; audience is "a group of friends," not strangers matched by rating |
| Free-text chat with no moderation backstop | Public lobby browser means strangers can share a room; predefined flavor prompts + host-kick are the v1 moderation strategy, not a full reporting system |
| Persistent server-side deck library / cloud save | Depends on accounts, which are out of scope; would duplicate work once accounts land |
| Rich mobile-optimized responsive layout | Desktop/browser-first per PROJECT.md; mobile must not be broken, but touch-optimized interaction design is not a v1 goal |
| In-match voice chat | Real infrastructure cost (WebRTC signaling/mixing) for something most groups already solve via Discord/in-person |
| Full custom-rule preset marketplace | Needs sharing/discovery/moderation infrastructure this milestone's no-accounts, local-storage-only constraints don't support |
| Gameplay rule changes/rebalancing | Engine is already built, tested, and validated — not frozen forever, but out of scope for *this* milestone. Rebalancing (e.g. Katja duel dominance, ambush spam, per CONCERNS.md) is expected once real playtesting surfaces issues; treat as a follow-up milestone informed by actual play, not a guess made now |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOME-01 | Phase 1 | Complete |
| HOME-02 | Phase 1 | Complete |
| LOBBY-03 | Phase 1 | Complete |
| LOBBY-04 | Phase 1 | Complete |
| LOBBY-05 | Phase 1 | Complete |
| MATCH-01 | Phase 1 | Complete |
| MATCH-02 | Phase 1 | Complete |
| MATCH-03 | Phase 1 | Complete |
| MATCH-04 | Phase 1 | Complete |
| MATCH-05 | Phase 1 | Complete |
| MATCH-08 | Phase 1 | Complete |
| HOME-04 | Phase 2 | Complete |
| DECK-01 | Phase 2 | Pending |
| DECK-02 | Phase 2 | Pending |
| DECK-03 | Phase 2 | Complete |
| DECK-04 | Phase 2 | Complete |
| DECK-05 | Phase 2 | Pending |
| HOME-03 | Phase 3 | Pending |
| LOBBY-01 | Phase 3 | Pending |
| LOBBY-02 | Phase 3 | Pending |
| LOBBY-06 | Phase 3 | Pending |
| LOBBY-07 | Phase 3 | Pending |
| CHAT-01 | Phase 3 | Pending |
| CHAT-02 | Phase 3 | Pending |
| CHAT-03 | Phase 3 | Pending |
| MATCH-06 | Phase 4 | Pending |
| MATCH-07 | Phase 4 | Pending |
| POLISH-01 | Phase 4 | Pending |

**Coverage:**

- v1 requirements: 28 total
- Mapped to phases: 28 ✓
- Unmapped: 0 ✓

*Note: the count previously recorded here (26) was a miscount of the same requirement list — the enumerated requirements above have always numbered 28 (HOME 4, DECK 5, LOBBY 7, CHAT 3, MATCH 8, POLISH 1). No requirements were added or removed during roadmap creation.*

---
*Requirements defined: 2026-08-19*
*Last updated: 2026-08-19 after roadmap creation (traceability populated)*
