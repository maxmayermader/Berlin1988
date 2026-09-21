# Requirements: Berlin 1988 — v1.1 Gameplay and UI Refinement

**Defined:** 2026-09-18
**Core Value:** A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete, playable 14-round match and see a result — with no gaps in the underlying rules engine.

**Milestone goal:** A human player can play the full game `docs/GAME_DESIGN.md` describes — every action and card usable, every clue and every burn visible — on a redesigned site deployed to Vercel that friends can join.

> **Why this milestone exists.** A 2026-09-14 human playtest found the order composer offers only Move, Hold and an undiscoverable Strike, and that neither the player's own burns nor an opponent's were visible anywhere. v1.0's `MATCH-02` ("assign 2 actions per agent — free moves, Intel-funded Sprints, loadout plays") was checked off without a human ever playing a card; `ORDER-01`–`ORDER-05` below supersede it. Most of this milestone is rendering data the server already sends: only the cross-agent Intel cost calculator (`packages/engine` export) and `SET_SETTINGS` (wire protocol + room handler) sit below the UI.

REQ-IDs continue v1.0's numbering where a category already exists (`LOBBY-08+`, `THEME-02+`); new categories start at 01.

## v1.1 Requirements

### Order Composition

- [ ] **ORDER-01**: Player can choose any action `legalOrders()` offers for the active slot — Move, Sprint, Wiretap, Bribe, Decoy, Safehouse, Strike, Hold — including which card pays for it and which node it targets
- [ ] **ORDER-02**: Player can set an Ambush and buy silencers without spending either of that agent's two actions
- [ ] **ORDER-03**: Player sees an option's Intel cost and cooldown state before choosing it
- [ ] **ORDER-04**: Player sees why an unavailable option is unavailable — on cooldown, not enough Intel, already committed by their other agent, or an illegal target
- [ ] **ORDER-05**: With 2 agents, the options offered for the second agent account for the Intel and card cooldowns the first agent's submitted order already consumed
- [ ] **ORDER-06**: Player can read any card's rules text, Intel cost, cooldown and color bonus from the composer
- [ ] **ORDER-07**: When a node is a legal target for more than one action (e.g. Move and Strike), the player chooses which one, rather than the UI silently picking
- [ ] **ORDER-08**: Player sees their agents' planned moves and targets drawn on the map before submitting
- [ ] **ORDER-09**: Player can change or withdraw a submitted order until the round locks

### Own Status and Signals

- [ ] **INTEL-01**: Player can see their current Intel throughout a match
- [ ] **INTEL-02**: Player can see their 10-card loadout with each active's cooldown and each passive's armed-or-consumed state
- [ ] **INTEL-03**: Player can see their silencer stock, safehouse location, live traps and live decoys
- [ ] **INTEL-04**: Player can read a persistent signals log, grouped by round — radio intercepts, adjacency chatter, "you are not alone", informant reports, border crossings, strike reports and blockade notices
- [ ] **INTEL-05**: Player can select a signal to highlight the node or sector it refers to on the map
- [ ] **INTEL-06**: Player sees a short per-round digest of what the round's signals revealed, alongside the raw log
- [ ] **INTEL-07**: The match UI distinguishes what is publicly known about the player from what only the player knows
- [ ] **INTEL-08**: Where a signal is deliberately vague (e.g. a strike reported by sector only), the withheld detail is shown as a redaction bar rather than left unexplained

### Burn Visibility

- [ ] **BURN-01**: Player can see at any time which of their own agents are alive and which are burned
- [ ] **BURN-02**: Player is told in the round it happens that one of their agents was burned, and what burned it, as far as fog allows
- [ ] **BURN-03**: Player can see, for every opponent, how many agents are alive versus burned and whether that player is eliminated
- [ ] **BURN-04**: Player can view every player's Burn Track, not only their own
- [ ] **BURN-05**: The round report names whose agent acted and whose agent was burned, within fog entitlement, instead of "An agent was burned"

### Resolution Replay

- [ ] **REPLAY-01**: Round resolution plays back on the map as a timed sequence of beats in the published resolution order, one step at a time
- [ ] **REPLAY-02**: Player can pause, step through, and skip to the end of a replay
- [ ] **REPLAY-03**: A replay beat shows and names only what the viewer's fog entitles them to; opponent movement the viewer never received is never animated
- [ ] **REPLAY-04**: Replay honors `prefers-reduced-motion` by cutting between beats instead of tweening

### Spectating

- [ ] **SPECT-01**: An eliminated player sees an explicit "eliminated — watching" state instead of an empty order panel
- [ ] **SPECT-02**: An eliminated player keeps receiving public events, the roster, Burn Tracks and round replays until the match ends
- [ ] **SPECT-03**: An eliminated player never sees more than their own fog entitled them to while alive

### Host Match Settings

- [ ] **LOBBY-08**: Host can set agents per player (1 or 2) before the match starts
- [ ] **LOBBY-09**: Host can set the round timer
- [ ] **LOBBY-10**: Host can set the round limit
- [ ] **LOBBY-11**: Host can set the blockade mode (off / announced / random / mixed)
- [ ] **LOBBY-12**: Host can set how many dossiers are on the map
- [ ] **LOBBY-13**: Every player in the lobby sees the current settings live, read-only
- [ ] **LOBBY-14**: The server rejects settings changes from non-hosts and any value outside the allowed range
- [ ] **LOBBY-15**: Changing a setting after players have readied up clears ready state, so nobody starts a match they didn't agree to

### Maps

- [ ] **MAP-01**: 3-player matches play on a 16-node FFA-16 map of Berlin built to `docs/GAME_DESIGN.md` §3.1 (avg degree ~3.0, 4 U-Bahn stations)
- [ ] **MAP-02**: 4-player matches play on an 18-node FFA-18 map built to §3.1 (avg degree ~3.2, 5 U-Bahn stations)
- [ ] **MAP-03**: The map is selected automatically from the player count — 1–2 Duel-12, 3 FFA-16, 4 FFA-18
- [ ] **MAP-04**: Each new map passes a bot-vs-bot sim sweep — no crashes, no runaway loadout or personality dominance, dossier count tuned for the player count — before humans play on it

### Visual Redesign

- [ ] **THEME-02**: Home, deckbuilder, lobby, match and result screens all use the declassified-dossier visual language (manila surfaces, typewriter headings, stamps)
- [ ] **THEME-03**: Dense data — loadout grid, signals log, Intel and cooldown numbers — stays on a plain, highly legible face rather than a typewriter face
- [ ] **THEME-04**: Text and interactive elements meet WCAG 2.1 AA contrast on the new backgrounds
- [ ] **THEME-05**: Sectors stay distinguishable without color, and keyboard navigation and reduced-motion support survive the redesign
- [ ] **THEME-06**: `docs/GAME_DESIGN.md` §1 and `docs/ARCHITECTURE.md` §9 describe the declassified-dossier aesthetic instead of the CRT aesthetic

### Deployment and Verification

- [ ] **DEPLOY-01**: Anyone with the link can open the game at a public Vercel URL that connects to the live PartyKit server
- [ ] **DEPLOY-02**: Merging to `main` redeploys the site automatically
- [ ] **DEPLOY-03**: A full match played entirely on the deployed site completes without desync, covering the Durable Object hibernation and four-player timing checks Phase 1's gate never ran
- [ ] **DEPLOY-04**: v1.0's 3 pending UAT scenarios (2 from Phase 1, 1 from Phase 2) are re-run against the deployed site and pass, clearing both `human_needed` verification reports

## Future Requirements

Deferred. Tracked but not in this roadmap.

### Replay

- **REPLAY-05**: Re-watch any earlier round's animated replay from the history drawer
- **REPLAY-06**: Captions explaining why a beat resolved as it did ("struck where they arrived, not where they were")
- **REPLAY-07**: Playback speed control
- **REPLAY-08**: Rubber-stamp moments on key events (BURNED, EXTRACTED)

### Match Flow

- **PAUSE-01**: Unanimous pause — any player requests, every live human seat must accept, one decline resumes (`plan.md` Phases 2 and 5)
- **BOT-01**: Per-seat bot difficulty and personality picker in the lobby

### Presentation

- **THEME-07**: High-contrast theme alongside the dossier look (`docs/ARCHITECTURE.md` §9)
- **DEPLOY-05**: Staging PartyKit deployment so Vercel preview builds don't talk to the server friends are playing on

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rule changes and rebalancing | Excluded again by the user for v1.1. Host settings only expose existing `MatchSettings` fields and new maps are content data, so neither changes the rules. Revisit once real play surfaces issues |
| Live animation of all agents at once | Carried from v1.0: the design doc specifies step-ordered resolution, and simultaneous animation risks leaking fog mid-animation. REPLAY-01 animates one beat at a time in published order |
| Omniscient spectator ("ghost mode") | `docs/GAME_DESIGN.md` §8.1 locks eliminated players to their own fog. The popular Among Us pattern is the wrong reference here |
| Client-side legality, Intel or cooldown math | The engine is the only source of truth. The UI renders `legalOrders()` output and the new engine cost calculator, never a parallel rules model |
| Renaming "Burn Track" | User chose to keep the design doc's vocabulary; labels and layout carry the distinction from "burned" instead |
| Host-selectable map | User chose automatic selection from player count, which removes a class of bad map/seat-count combinations |
| Searchable or filterable long-form combat log | Risks re-filtering history against fresher state (the leak class v1.0 fixed) and lets players triangulate beyond what single signals reveal |
| Typewriter styling on dense data | Measurably hurts legibility in tables and numbers; the dossier skin sits over a legible information layer |
| User accounts, cross-device deck sync | No auth system in v1; nothing yet requires cross-device persistence |
| Mobile-optimized layout | Desktop-first; mobile must not be broken, but touch-optimized design is not a v1.1 goal |
| Audio and interactive tutorial | `plan.md` Phase 7, not this milestone |

## Traceability

Mapped during roadmap creation, 2026-09-18. v1.1 phase numbering continues from v1.0 (which ended at Phase 4).

| Requirement | Phase | Status |
|-------------|-------|--------|
| ORDER-01 | Phase 7 | Pending |
| ORDER-02 | Phase 7 | Pending |
| ORDER-03 | Phase 7 | Pending |
| ORDER-04 | Phase 7 | Pending |
| ORDER-05 | Phase 7 | Pending |
| ORDER-06 | Phase 7 | Pending |
| ORDER-07 | Phase 7 | Pending |
| ORDER-08 | Phase 7 | Pending |
| ORDER-09 | Phase 7 | Pending |
| INTEL-01 | Phase 8 | Pending |
| INTEL-02 | Phase 8 | Pending |
| INTEL-03 | Phase 8 | Pending |
| INTEL-04 | Phase 8 | Pending |
| INTEL-05 | Phase 8 | Pending |
| INTEL-06 | Phase 8 | Pending |
| INTEL-07 | Phase 8 | Pending |
| INTEL-08 | Phase 8 | Pending |
| BURN-01 | Phase 8 | Pending |
| BURN-02 | Phase 8 | Pending |
| BURN-03 | Phase 8 | Pending |
| BURN-04 | Phase 8 | Pending |
| BURN-05 | Phase 8 | Pending |
| REPLAY-01 | Phase 9 | Pending |
| REPLAY-02 | Phase 9 | Pending |
| REPLAY-03 | Phase 9 | Pending |
| REPLAY-04 | Phase 9 | Pending |
| SPECT-01 | Phase 9 | Pending |
| SPECT-02 | Phase 9 | Pending |
| SPECT-03 | Phase 9 | Pending |
| LOBBY-08 | Phase 6 | Pending |
| LOBBY-09 | Phase 6 | Pending |
| LOBBY-10 | Phase 6 | Pending |
| LOBBY-11 | Phase 6 | Pending |
| LOBBY-12 | Phase 6 | Pending |
| LOBBY-13 | Phase 6 | Pending |
| LOBBY-14 | Phase 6 | Pending |
| LOBBY-15 | Phase 6 | Pending |
| MAP-01 | Phase 6 | Pending |
| MAP-02 | Phase 6 | Pending |
| MAP-03 | Phase 6 | Pending |
| MAP-04 | Phase 6 | Pending |
| THEME-02 | Phase 10 | Pending |
| THEME-03 | Phase 10 | Pending |
| THEME-04 | Phase 10 | Pending |
| THEME-05 | Phase 10 | Pending |
| THEME-06 | Phase 10 | Pending |
| DEPLOY-01 | Phase 5 | Pending |
| DEPLOY-02 | Phase 5 | Pending |
| DEPLOY-03 | Phase 10 | Pending |
| DEPLOY-04 | Phase 10 | Pending |

**Phase rollup:**

| Phase | Name | Requirements | Count |
|-------|------|--------------|-------|
| 5 | Live Deployment | DEPLOY-01, DEPLOY-02 | 2 |
| 6 | Host Match Settings & Full-Size Maps | LOBBY-08 … LOBBY-15, MAP-01 … MAP-04 | 12 |
| 7 | Full Order Composer | ORDER-01 … ORDER-09 | 9 |
| 8 | Own Status, Signals & Burn Visibility | INTEL-01 … INTEL-08, BURN-01 … BURN-05 | 13 |
| 9 | Resolution Replay & Spectating | REPLAY-01 … REPLAY-04, SPECT-01 … SPECT-03 | 7 |
| 10 | Declassified Dossier Redesign & Live Verification | THEME-02 … THEME-06, DEPLOY-03, DEPLOY-04 | 7 |

**Coverage:**
- v1.1 requirements: 50 total
- Mapped to phases: 50 ✓
- Unmapped: 0
- Duplicated across phases: 0

## Notes for Planning

- **Superseded:** v1.0's `MATCH-02` was marked complete but only Move/Hold/hidden-Strike shipped. `ORDER-01`–`ORDER-05` are the real thing. v1.0's deferred `DEDUCE-01` (post-round digest) is promoted into `INTEL-06`; its deferred `THEME-01` (CRT pass) is superseded by `THEME-02`–`THEME-06`.
- **Below-the-UI work:** a pure Intel cost calculator exported from `packages/engine` (for ORDER-05), `SET_SETTINGS` added to the wire protocol and room handler (for LOBBY-08–LOBBY-15), a retract/replace path for ORDER-09, and two new map data files plus a `MAPS` registry entry (MAP-01–MAP-03). Everything else renders `PlayerView` fields that already exist.
- **Fog-of-war is the standing risk** across BURN, REPLAY, SPECT and INTEL: every new surface must render only what `projectView()`/`filterEvents()` already graded, never re-derive or re-filter. See `.planning/research/PITFALLS.md` Pitfalls 1, 2, 3, 5.
- **Decisions taken at requirements time:** keep the "Burn Track" name; spectators get the public feed on a bare map (no engine change); map derived from player count; Vercel previews point at the production PartyKit host; no unanimous pause, so the host round-timer setting is the only mitigation for the 4-actions-per-round squeeze (`PITFALLS.md` Pitfall 10 — never measured; worth timing during DEPLOY-03).

---
*Requirements defined: 2026-09-18*
*Last updated: 2026-09-18 after v1.1 roadmap creation (traceability populated, Phases 5-10)*
