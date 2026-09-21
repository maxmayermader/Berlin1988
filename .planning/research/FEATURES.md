# Feature Research

**Domain:** Simultaneous-turn hidden-movement game — in-match UI (order composer, deduction surfaces, resolution replay, spectating, lobby settings, diegetic visual redesign)
**Researched:** 2026-09-15
**Confidence:** MEDIUM overall (HIGH on rules/architecture constraints pulled from this repo's own docs; MEDIUM/LOW on external genre conventions — see per-item notes; several claims below are corroborated by both web search and established genre knowledge and are flagged MEDIUM, a few rest on genre knowledge alone with no single strong source and are flagged LOW)

This file covers **only the 8 new feature areas** for milestone v1.1. It does not re-research anything already shipped in v1.0 (board rendering, Move/Hold order flow, deckbuilder, lobby ready-up, chat, round history drawer, own Burn Track panel — see PROJECT.md "Validated").

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features players of this genre assume exist. Missing them made the 2026-09-14 playtest feel broken — that trigger *is* the evidence these are table stakes, not nice-to-haves.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Full action/card picker in the order composer** (Sprint, Wiretap, Bribe, Decoy, Safehouse, Strike-mode-A, Ambush/Strike-mode-B, silencer buy) | Every reference game in this genre (Frozen Synapse, Into the Breach, Hearthstone, Two Spies itself) lets you pick from your *entire* available toolkit each turn, not a subset. `legalOrders()` already returns every legal action; the UI is the only thing missing this. | MEDIUM | Two-step interaction pattern is standard: (1) pick an ability/action, (2) pick a target on the map, mirroring Hearthstone/Slay the Spire "select card → drag/click target" and Into the Breach "select unit → select tile." Berlin 1988's wrinkle: some actions (Ambush, silencer) target *no* node (self-only) and some (Wiretap) can target *any* node, not just adjacent — the composer needs both an "implicit self-target" path and a "pick anywhere" path, not just adjacency highlighting. |
| **Cost/cooldown/availability shown before commit** | Hearthstone shows mana cost on the card face before you drag it; Into the Breach shows ability cost/charge state in the unit panel before you select a tile. Committing an order you can't afford, silently rejected after the fact, reads as a bug. | LOW–MEDIUM | `viewForOrdering()`/`self` in `PlayerView` already carries Intel, cooldowns, and passive status — this is a pure rendering task once the composer exists, not new engine work. Must show *why* something is greyed out (on cooldown vs. can't afford vs. shared Intel pool already spent by the other agent this round), matching the "why is this illegal" affordance genre convention (Slay the Spire dims and won't accept a drop when a card can't legally be played; Into the Breach's UI database groups this under "Equipped Items & Abilities" state, not a floating tooltip only). |
| **Two-agent order composition sharing one Intel pool** | Design doc §4 makes this the core tactical tension (4 actions, shared Intel, per-card cooldowns shared across agents). If the UI computes each agent's legality independently, ordering Agent A first can make an action for Agent B look legal when it no longer will be once A commits. | MEDIUM–HIGH | `viewForOrdering(state, playerId, agentId)` exists precisely to solve this — call it per-agent, in order, threading each just-submitted order into the next call's view before showing Agent B's options. This is the single trickiest bit of new order-composer engineering; genre precedent (Frozen Synapse's per-unit waypoint planning with a shared "Prime" commit) confirms the two-phase pattern (assemble multiple units' orders locally, submit together) but none of the reference games share a *resource pool* across units the way Berlin 1988 shares Intel — this constraint is closer to a shared-mana multi-creature turn in a TCG than to any single hidden-movement precedent found. |
| **A committed-but-editable order until the round locks** (retract per agent) | Already in the wire protocol (`RETRACT_ORDER`) and matches every reference game's "plan, then commit" split (Frozen Synapse explicitly separates unlimited planning time from a distinct resolution step). | LOW | Protocol-level support already exists (`docs/ARCHITECTURE.md` §5); this is wiring, not new design. |
| **Own-status panel: Intel, full loadout with cooldown/passive state, silencers, safehouse, traps, decoys** | Every card game (Hearthstone) and every tactics game (Into the Breach's "Equipped Items & Abilities" panel) puts your own full resource state in one glanceable place. `PlayerView.self` already contains all of this — it's an unrendered field, per the playtest audit. | LOW–MEDIUM | Straightforward per-field rendering; the design nuance is grouping (actives vs. passives vs. consumables) and showing cooldown as a countdown, not a boolean, matching Hearthstone-style ability-charge UI conventions. |
| **Signals log surfaced every round** (`docs/GAME_DESIGN.md` §10: own vision, adjacency chatter, "you are not alone," informant reports, radio intercept, public events, Burn Tracks) | Hidden-movement genre convention across Scotland Yard, Fury of Dracula, and Specter Ops is a *persistent, re-readable* clue trail — never a toast that vanishes. The design doc itself calls complete fog "a design trap" and signals the intended fix; a UI that drops these on the floor defeats the deduction pillar entirely. | MEDIUM | `PlayerView.signals` already exists and is unrendered per the playtest audit — again UI-only, but the *log* (append-only, grouped by round, scrollable back) is new UI structure, not a single-round toast. Precedent: Scotland Yard Master's app replaced a physical travel log with a persistent digital one rather than an ephemeral popup; Fury of Dracula players explicitly asked for exactly this kind of scrollable full-game log when the app lacked one. |
| **Alive/burned roster for every player, not just self** | Every multiplayer game with eliminations (Among Us's "died/reported" state, any shooter roster) shows *whose* pieces are gone at a glance without narrating position. This is literally the second playtest-blocking gap found: "could not tell whether their own or an opponent's agents had been burned." | LOW | `PlayerView.opponents[].agentsAlive/eliminated` already exists per the code audit — unrendered. This is presentation only. Must not show *where* an agent was when burned beyond what `ResolutionEvent`/signals already grade (adjacent-exact vs. sector-vague vs. nothing) — see Anti-Features. |
| **Every player's Burn Track visible, not only your own** | `docs/GAME_DESIGN.md` §6.3 explicitly defines the Burn Track as symmetric public information ("everyone's, including your own"); `PlayerView.burnTracks` is already `Record<PlayerId, BurnEntry[]>` for exactly this reason. Only rendering your own (v1.0's shipped scope) is an intentional narrowing that the design doc never asked for. | LOW | Data already flows correctly per §4.2 of ARCHITECTURE.md (symmetric, single-computed-once, redaction from *Cutout* baked in at append time) — purely a rendering gap, and the lowest-risk item in this whole milestone because there's no fog-boundary reasoning left to get wrong. |
| **Animated but skippable resolution replay naming actors within fog entitlement** | Genre convention from Frozen Synapse (a single button replays the ~5s simultaneous resolution) and this project's own architecture doc (§9: "the most important UI in the game," ~700ms/beat, skippable and scrubbable) already commits to this. | HIGH | This is the most complex single new surface. `ResolutionEvent[]` is already fog-filtered server-side (ARCHITECTURE.md §4.2) so the timeline can safely animate/name whatever is in the log — the complexity is sequencing 11 priority-ordered event types into a legible timeline with skip/scrub, not re-deriving what's visible (that work is already done upstream). |
| **Spectator view for eliminated players (own fog only)** | Standard in social/hidden-info multiplayer (Among Us ghosts, any battle-royale spectator cam) that eliminated players keep watching rather than being ejected from the room; `plan.md` Phase 5 already lists "spectator seats for eliminated players (own fog only)" as a requirement. | MEDIUM | Important genre divergence to note: Among Us intentionally grants ghosts *omniscient* vision because the game is over for them strategically and nothing is left to protect. Berlin 1988 must NOT copy that — GAME_DESIGN.md §8.1 says an eliminated player "stays in the room as spectator, seeing only what their own fog allowed them to see while alive," i.e., frozen/continuing at their own historical entitlement, not a promotion to full information. This is an explicit design decision already made; the research finding is simply "don't reach for the Among Us pattern here." |
| **Host lobby settings for agents/timer/round-limit/blockade-mode/dossier-count, server-enforced** | `docs/GAME_DESIGN.md` §2 already defines this settings table; Board Game Arena's convention (configure everything before opening the table, non-hosts see current settings from the listing) is the standard shape for this UI pattern and matches what's already speced. | MEDIUM | Genre convention (BGA) confirms: settings must be visible to non-host players too, not host-only — the lobby's public listing should reflect current settings before anyone joins, and joined non-host players should see them read-only, live-updating if host changes them pre-start. Server-side enforcement (never trust a client-set value) is already a hard rule in this codebase (Zod at every boundary) so this is a UI-plus-validation task, not a new trust model. |
| **Two additional maps sized for 3–4 players (FFA-16, FFA-18)** | `docs/GAME_DESIGN.md` §3.1 already specifies node counts, average degree, and U-Bahn station counts for both; "content is data, not code" (CLAUDE.md rule 5) means this is map-data authoring against the existing `NodeState`/edges schema, not new engine logic. | MEDIUM | Complexity lives entirely in map *design* (graph balance: sightlines, chokepoints, U-Bahn placement) rather than code — the existing Duel-12 map is the template. Needs sim-harness validation (bot-vs-bot balance sweep) before being trusted with humans, per this project's own established practice. |

### Differentiators (Competitive Advantage)

Features that go beyond bare functional parity and specifically serve this project's core value (a hidden-movement deduction game that's actually legible to new players, per plan.md's Phase 2 done-condition: "a person who has never seen the game can complete a match... and correctly explain what happened").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **"What they know about me" framing for the Burn Track, applied consistently to the roster/signals redesign** | GAME_DESIGN.md §6.3 already calls for a "what they know" panel for your own Burn Track — extending that self-audit framing to the whole information surface (i.e., every panel answers "what is publicly known" vs. "what only I know") is what separates a legible deduction game from a confusing fog-of-war mess. No reference game in this research explicitly frames its UI this way, which is a genuine opportunity: most digital hidden-movement adaptations (Scotland Yard Master, Fury of Dracula digital) show *your* clues but rarely surface "here is exactly what your opponents can currently infer about you." | MEDIUM | Mostly a copy/labeling and information-architecture exercise on top of data that already exists in `PlayerView` — pairs the Burn Track with the roster and signals log under one mental model ("public record" vs. "private intel") rather than three disconnected panels. |
| **Naming/renaming "Burn Track" vs. "burned" to resolve the collision PROJECT.md flags** | The v1.0 postmortem explicitly notes the terminology collision between "Burn Track" (card-use history) and "burned" (agent killed) as a source of confusion. Fixing this is cheap and directly improves the exact confusion the playtest surfaced. | LOW | Pure copy/naming change (e.g., rename the public capability log to something like "Dossier on You" / "Known Capabilities" and reserve "burned" strictly for agent death) — no engine change, and it is a genuinely differentiated UX decision no reference game needed to solve because none of them have this specific double meaning. |
| **Replay that narrates causally ("shoot where they're going, not where they are")** | GAME_DESIGN.md §7.2 explicitly states this is "the skill ceiling of this game" and that resolution order is fixed and published specifically so players can learn to reason about it. A replay that visually demonstrates movement completing *before* strikes resolve (rather than just listing events) teaches the game's central skill passively, matching Into the Breach's philosophy that telegraphing exactly what happens and why makes every loss feel like the player's own fault rather than the game's. | MEDIUM–HIGH | Requires sequencing the 11-step pipeline into visually distinct beats (movement completes and is *seen* completing, then a scan happens against the new position, then a strike lands or misses against that same new position) rather than a flat chronological event list — this is a presentation/sequencing decision layered on top of the already-ordered `ResolutionEvent[]`. |
| **Redacted/graded information display matching strike-noise grading (adjacent = exact node, everyone else = sector only)** | Already a `projectView()`-level mechanic (ARCHITECTURE.md §4.2) — surfacing this gradient visually (e.g., a roster/signals entry that's precise for you and vague for others, styled as a redaction bar over the parts you're not entitled to) turns an existing fog mechanic into the literal "declassified dossier" visual metaphor the milestone wants, unifying two otherwise-separate goals (deduction UI + visual redesign) into one coherent idea. | MEDIUM | This is where the "declassified dossier" aesthetic (manila paper, redaction bars, stamps) can do double duty as *functional* UI — a redaction bar isn't just decoration, it's the correct way to represent "you don't have entitlement to this part of the signal." Genre research found no reference game combining a diegetic redacted-document skin with an actual fog-of-war entitlement boundary this literally; it's a strong differentiator specific to this project's premise. |

### Anti-Features (Commonly Requested, Often Problematic)

Ranked by how directly they would violate this project's hard fog/purity rules (CLAUDE.md, ARCHITECTURE.md §4.1) or re-implement engine logic client-side.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| **Showing an opponent's exact node the moment they're burned, in the roster or replay, beyond what strike-noise grading allows** | Feels natural — "they died, why can't I see where" — and several genre roster/kill-feed conventions (shooter kill feeds) show exact location. | This is a direct fog-of-war leak. GAME_DESIGN.md §5.2 deliberately grades strike noise (exact node only for adjacent agents, sector-only for everyone else, nothing if silenced); the roster/replay must respect the *same* grading `projectView()` already applied to the underlying `ResolutionEvent`/signal, not re-derive or "helpfully" upgrade precision because the UI happens to know the node id from some other field. | Show only what the corresponding signal/event already grades: "burned" + (exact node if you were adjacent; sector name if not; nothing beyond "burned" if silenced and non-adjacent). Never let the roster or replay reach into a full `GameState`-shaped object for extra detail the fog boundary withheld. |
| **Ghost/spectator omniscience after elimination (Among Us pattern)** | Among Us's ghosts get full-map vision and it's a well-known, well-liked pattern from the genre's most popular game. | GAME_DESIGN.md §8.1 already explicitly rejects this: eliminated players see only what their fog allowed *while alive*, continuing forward at that same entitlement — because unlike Among Us (game effectively over for that player's win condition, no one left to protect), Berlin 1988's other living players still have secrets worth protecting from someone who might describe the match to a partner in a 2v2, or simply because unequal information among "equally eliminated" spectators would be unfair. | Spectator mode = continue receiving `projectView()` output for that player's seat exactly as before elimination (their agents are gone/removed per §8.1, but their fog boundary and Burn Track visibility rules don't change). This is already the design decision on record — the anti-feature is any drift toward "let's just show them everything since they're out anyway." |
| **Client-side legality re-computation instead of using `legalOrders()`/`viewForOrdering()`** | Tempting shortcut when building the order composer — "just grey out anything that looks wrong" using ad hoc UI logic (e.g., "if Intel < cost, grey it out") instead of calling into the engine's own query functions. | Re-implements engine rules in the UI, which is explicitly the kind of drift this codebase's architecture is built to prevent (`packages/engine` is the one source of truth for legality; ARCHITECTURE.md frames the client's copy of the engine as strictly "predictive, never authoritative"). Ad hoc UI-side legality checks will inevitably drift from the real rules (e.g., forgetting the shared-Intel-pool-across-two-agents wrinkle, or the "already trapped this node" rule) and produce a composer that shows something as legal that the server then rejects, or vice versa. | Always call `legalOrders(view, agentId, prefix)` / `viewForOrdering()` from `@berlin/engine` to drive what the composer offers and greys out — the UI's job is presentation of engine output, never a parallel legality model. |
| **A persistent, filterable "combat log" that lets a player search/replay any past round's exact hidden data (e.g., "show me exactly where I was hit from")** | Feels like a quality-of-life win — deduction games reward re-reading old clues, so "let me pull up everything" seems aligned with the genre. | Two risks: (1) if built naively by re-filtering historical events against the player's *current* state rather than what was computed once at that round's resolution time, it reproduces the exact STRIKE_FIRED regression this project already found and fixed in Phase 4 (documented in PROJECT.md's Key Decisions — "round history is a server-side full match log, filtered exactly once at round-resolution time, never re-filtered later"); (2) an overly powerful search/filter UI risks aggregating fog-graded signals in a way that lets a player triangulate information beyond what any single signal was designed to reveal (e.g., cross-referencing every "sector-only" strike report over many rounds to back out an opponent's safehouse faster than the design intends). | Reuse the existing round history drawer pattern (already shipped, already filtered once and stored) — extend its rendering, not its filtering logic. Any new "search my history" feature should operate over already-filtered, already-stored per-round views, never re-derive from a fresher state. |
| **A single monolithic "diegetic" font/texture applied to every panel including dense data tables (loadout grid, signals log)** | The declassified-dossier aesthetic (manila paper, typewriter type, stamps) is explicitly the milestone's visual direction, and it's tempting to apply it uniformly for consistency. | Genre research (typography/accessibility sources) consistently finds stylized/typewriter fonts measurably harder to read at body-text length and in dense tabular data than a plain face; ARCHITECTURE.md §9 already establishes the precedent for this project (the CRT aesthetic was themeable tokens, not applied indiscriminately, and sector color was never allowed to be the only signal) and PROJECT.md explicitly keeps "non-color sector encoding, keyboard navigation, and reduced-motion support" as non-negotiable even while deselecting the high-contrast theme for this milestone. | Reserve typewriter/stamp/manila treatment for headers, card names, stamps, and short labels; use a plain, high-legibility face for body text, numeric data (Intel counts, cooldown timers), and the signals log/loadout grid — matching the "diegetic skin over a legible information layer" approach this project already uses successfully for its board (SVG shapes/patterns, not just color, per §9). |

---

## Feature Dependencies

```
Full order composer (all actions/cards + cost/cooldown display)
    └──requires──> viewForOrdering() per-agent sequencing (existing engine function, unused by UI today)
    └──requires──> own-status panel data model (Intel, loadout, cooldowns) — same PlayerView.self fields

Own-status panel
    └──shares data with──> Burn Track ("what they know about me") differentiator

Signals log
    └──requires──> PlayerView.signals rendering (already delivered by server, unrendered)
    └──enhances──> Roster (adjacency chatter / "not alone" signals contextualize roster state)

Roster (alive/burned, every player) + every player's Burn Track
    └──requires──> PlayerView.opponents[].agentsAlive/eliminated + burnTracks (already delivered, unrendered)
    └──shares fog-grading rules with──> Resolution replay (both must respect the same strike-noise grading)

Resolution replay (animated, skippable, fog-bound)
    └──requires──> ResolutionEvent[] fog-filtering (already done server-side, existing)
    └──requires──> Roster/Burn Track naming conventions (a beat that burns an agent must match what the roster then shows)
    └──enhances──> "shoot where they're going" differentiator (causal narration)

Spectator view for eliminated players
    └──requires──> Same projectView()-per-seat mechanism already used for live players — no new fog logic
    └──conflicts with──> Any temptation to grant omniscience post-elimination (explicitly rejected in GAME_DESIGN.md §8.1)

Host lobby settings (agents/timer/round-limit/blockade/dossier-count)
    └──requires──> Server-side enforcement of MatchSettings (existing Zod validation pattern) — SET_SETTINGS is host-only per protocol
    └──enables──> FFA-16 / FFA-18 maps being selectable at all (agent-count and map choice are coupled: 2 agents recommended default per GAME_DESIGN.md §2)

FFA-16 / FFA-18 maps
    └──requires──> Existing map-data schema (NodeId, edges, sector, x/y%) — no engine changes
    └──requires──> Sim-harness balance validation before human play (established project practice from Phase 3/4)

Declassified-dossier visual redesign
    └──enhances──> All of the above (applied last, as a skin over already-correct information architecture)
    └──conflicts with──> Applying typewriter/stamp treatment to dense data panels (legibility anti-feature above)

Deploy apps/web to Vercel
    └──independent of──> all UI features above, but is the actual blocker on closing the two pending human-verification UAT gaps from Phase 1/2
```

### Dependency Notes

- **Order composer requires `viewForOrdering()`, not `projectView()`:** ARCHITECTURE.md §4 is explicit that composing actions for a two-agent player must go through `viewForOrdering(state, playerId, agentId)` rather than the standard fog-projected `PlayerView`, because a player's own two agents share one Intel pool and per-card cooldowns that `projectView()` alone doesn't sequence correctly across an in-progress order submission. This is the one piece of "new" engine-adjacent work in the whole milestone (calling an existing function correctly, in the right sequence) rather than pure UI.
- **Roster, Burn Track, and resolution replay must share one fog-grading source of truth:** all three surfaces describe overlapping facts (who got burned, from where, how visibly) and must derive that from the identical already-fog-filtered `ResolutionEvent`/`signals`/`burnTracks` fields rather than each independently deciding how much to reveal — divergence here is exactly how a fog leak or a confusing contradiction (roster says "burned," replay is vague about why) would slip in.
- **Spectator view conflicts with the Among Us omniscience pattern:** flagged explicitly because it's the most popular reference point in the genre and the wrong one for this project's already-decided design (§8.1's fog-preserving spectator).
- **Host settings enable the new maps, but aren't the same phase of work as the maps themselves:** settings UI is protocol/lobby work; maps are content-data authoring plus a balance-sim pass. They can proceed in parallel once `MatchSettings`/map-selection wiring exists, but map balance validation should not block settings UI, and settings UI should not block map authoring.
- **Visual redesign is applied last, everywhere:** because it's explicitly a "skin," per this project's own precedent of keeping the CRT theme as a themeable token layer (ARCHITECTURE.md §9), it should not be the vehicle that also fixes information-architecture gaps — those (order composer, signals log, roster, Burn Track) must be functionally correct first, in whatever baseline styling, then reskinned.
- **Vercel deployment is orthogonal but time-sensitive:** it doesn't block any UI feature's *implementation*, but it blocks *verification* of all of them under real network conditions (per PROJECT.md's Context, it's the root cause of the still-open Phase 1/2 human-verification gaps) — sequencing it early enough to leave time for a real multi-browser playtest before milestone close is a scheduling dependency, not a technical one.

---

## MVP Definition

Framed against this milestone's own stated "Done looks like": *the maintainer and friends open the deployed site, play a 3–4 player match on a proper map with 2 agents each, use their cards, and can follow each round's replay and who got burned.*

### Launch With (v1.1)

Everything in the Table Stakes section above — all eight target features are load-bearing for the stated "done" condition; none can slip without directly reproducing a symptom the 2026-09-14 playtest already flagged as broken:

- [ ] Full order composer (all actions/cards, cost/cooldown/availability shown) — the playtest's #1 blocking gap
- [ ] Own-status panel (Intel, loadout w/ cooldowns, silencers, safehouse, traps, decoys)
- [ ] Signals log (§10 information drip)
- [ ] Roster (alive/burned, every player) + every player's Burn Track — the playtest's #2 blocking gap
- [ ] Animated, skippable, fog-bound resolution replay
- [ ] Spectator view for eliminated players (own fog only)
- [ ] Host lobby settings, server-enforced
- [ ] FFA-16 and FFA-18 maps
- [ ] Declassified-dossier visual redesign (applied last, per dependency notes)
- [ ] `apps/web` deployed to Vercel, linked to live `apps/party`

### Add After Validation (v1.x)

Not part of v1.1 scope per PROJECT.md's Out of Scope, but flagged by this research as natural next steps once the above ships and is playtested again:

- [ ] "What they know about me" unifying framing across roster/Burn Track/signals (the Differentiator above) — worth doing once the raw panels exist and a second playtest shows whether the connection needs to be made explicit
- [ ] Unanimous pause flow (explicitly deselected this milestone; round timer is the interim mitigation) — revisit if the new 4-action, shared-Intel composer proves too slow under a timer in practice
- [ ] High-contrast theme (explicitly deselected this milestone) — revisit once the declassified-dossier redesign's baseline contrast is measured against WCAG 2.1 AA

### Future Consideration (v2+)

- [ ] Per-seat bot difficulty/personality picker (explicitly deselected this milestone)
- [ ] Audio and interactive tutorial (`plan.md` Phase 7, not in this milestone)
- [ ] Searchable/filterable long-form combat log beyond the existing round-history drawer pattern (Anti-Feature above unless built carefully on top of already-filtered stored views)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Full order composer (all actions/cards) | HIGH | HIGH | P1 |
| Own-status panel | HIGH | LOW-MEDIUM | P1 |
| Signals log | HIGH | MEDIUM | P1 |
| Roster (alive/burned) + all Burn Tracks | HIGH | LOW | P1 |
| Resolution replay (animated, skippable) | HIGH | HIGH | P1 |
| Spectator view | MEDIUM | MEDIUM | P1 |
| Host lobby settings | MEDIUM | MEDIUM | P1 |
| FFA-16 / FFA-18 maps | MEDIUM | MEDIUM | P1 |
| Declassified-dossier visual redesign | MEDIUM | MEDIUM-HIGH | P1 |
| Vercel deployment | HIGH (blocks verification) | LOW-MEDIUM (unknown env blockers) | P1 |
| "What they know about me" unifying framing | MEDIUM | LOW | P2 |
| Redaction-bar-as-fog-grading visual metaphor | MEDIUM | MEDIUM | P2 |
| Burn Track / "burned" terminology fix | LOW-MEDIUM | LOW | P2 |

All P1 items are already committed Active requirements in PROJECT.md — this matrix confirms none of them are safely descopable without reproducing the milestone's own trigger condition, and orders the two P2 items as cheap, high-leverage additions if time remains after P1.

---

## Competitor / Reference-Game Feature Analysis

| Feature Area | Closest Reference(s) | How They Do It | Berlin 1988's Approach |
|---------|--------------|--------------|--------------|
| Ability + target selection | Hearthstone, Slay the Spire, Into the Breach | Select ability/card → valid targets highlight, invalid dim → commit | Same two-step pattern, but must additionally sequence two agents against one shared Intel pool via `viewForOrdering()` — no single reference game combines multi-unit selection with a shared resource pool this way |
| Deduction log / clue trail | Scotland Yard (paper log, app-replaced), Fury of Dracula (face-down trail cards + requested digital log), Specter Ops (private coded movement sheet) | Persistent, re-readable, round-grouped trail; never an ephemeral toast | Persistent signals log grouped by round, matching `PlayerView.signals`; must additionally surface symmetric Burn Tracks, which none of these physical-game ports need to solve digitally |
| Status/roster without leaking hidden info | Among Us (alive/dead/ghost state, kill feed abstraction), general shooter kill feeds (killer+victim+weapon, post-hoc only) | Show binary alive/dead state broadly; never show ongoing hidden position | Show alive/burned + Burn Track, gated by the same strike-noise grading `projectView()` already applies — stricter than a typical kill feed because "how" and "where" must stay fog-graded per event, not just "who" |
| Simultaneous-turn replay | Frozen Synapse (single-button replay of a fixed simulated window), webDiplomacy/Backstabbr (rules-resolved diff, not an animated timeline) | Frozen Synapse is the strongest precedent for an on-demand, replayable simultaneous-resolution window; Diplomacy tooling is comparatively text/diff-based | Animated, skippable, ~700ms/beat timeline (already speced in ARCHITECTURE.md §9) closer to Frozen Synapse than to Diplomacy tooling, but must additionally respect per-viewer fog grading, which neither reference game needs (both are either full-information or turn-based-visible) |
| Spectating after elimination | Among Us (omniscient ghost mode) | Full-map, no-restriction vision once eliminated, since the game is functionally over for that player | Explicitly rejected — GAME_DESIGN.md §8.1 keeps eliminated players locked to their own last-known fog entitlement, because other players' secrets still matter after one player is out |
| Host lobby settings | Board Game Arena (configure before opening table; lobby listing shows non-default options; presets like "friendly mode" plus itemized toggles) | Preset-plus-toggle hybrid, visible pre-join | Same hybrid approach fits GAME_DESIGN.md §2's settings table (which already reads like BGA's preset/toggle split: Teams FFA/2v2 as a preset-like choice, individual sliders for timer/round-limit/dossiers) |
| Diegetic document styling | Papers Please, Orwell, Phantom Doctrine (in-fiction documents/case files, high immersion, needs careful information hierarchy underneath) | Full diegetic skin, with real risk of hurting scannability of dense data | Reserve diegetic (manila/typewriter/stamp) treatment for headers/labels/stamps; keep body text and dense data (loadout grid, signals log, Intel/cooldown numbers) on a plain legible face — matches this project's own established pattern of theming the CRT look as swappable tokens rather than universally applying it |

---

## Sources

Confidence per the project's own classify-confidence seam: MEDIUM = cross-checked against genre knowledge and corroborated by at least one web source; LOW = single unverified web source or genre-knowledge-only claim with no strong corroborating source found. No HIGH-confidence external sources were found for this domain (no official design-pattern documentation exists for most of these mechanics); HIGH confidence in this file is reserved for direct citations of this repo's own `docs/GAME_DESIGN.md` and `docs/ARCHITECTURE.md`.

- [Into the Breach — Game UI Database](https://www.gameuidatabase.com/gameData.php?id=483) — MEDIUM
- [Into the Breach & Enemy Intentions — Atomic Bob-Omb](https://atomicbobomb.home.blog/2020/05/17/into-the-breach-enemy-intentions/) — MEDIUM
- [Frozen Synapse — Wikipedia](https://en.wikipedia.org/wiki/Frozen_Synapse) — MEDIUM
- [Frozen Synapse Review — Calm Down, Tom](https://calmdowntom.com/2011/06/frozen-synapse-review-pc/) — MEDIUM
- [Two Spies — Tips, playspies.com](https://playspies.com/tips) and [FAQ](https://playspies.com/faq) — MEDIUM
- [Scotland Yard (board game) — Wikipedia](https://en.wikipedia.org/wiki/Scotland_Yard_(board_game)) — MEDIUM
- [Scotland Yard Master — App Store](https://apps.apple.com/us/app/scotland-yard-master/id686943176) — MEDIUM
- [Fury of Dracula: Digital Edition — Immortal Update, Nomad Games](https://nomadgames.co.uk/blog/fury-immortal-update) — MEDIUM
- [Fury of Dracula App | boardgamegeek thread](https://boardgamegeek.com/thread/1469197/app) — MEDIUM
- [Specter Ops — BoardGameGeek](https://boardgamegeek.com/boardgame/155624/specter-ops) — MEDIUM
- [Specter Ops Board Game Guide — Dice n Board](https://dicenboard.com/game-guides/specter-ops-board-game-guide/) — MEDIUM
- [Among Us — Ghost, Fandom wiki](https://among-us.fandom.com/wiki/Ghost) — MEDIUM
- [Among Us Ghost Guide — Theria Games](https://theriagames.com/guide/among-us-ghost-guide/) — MEDIUM
- [Kill Feed (Concept) — Giant Bomb](https://giantbomb.com/wiki/Concepts/Kill_Feed) — LOW
- [webDiplomacy orderinterface.php — GitHub](https://github.com/kestasjk/webDiplomacy/blob/master/board/orders/orderinterface.php) — LOW
- [DATC Tests — webDiplomacy](https://webdiplomacy.net/datc.php) — LOW
- [Board Game Arena forum — Automatic lobby and Special settings](https://forum.boardgamearena.com/viewtopic.php?t=20344) — MEDIUM
- [Options and preferences: gameoptions.json — BGA docs](https://en.doc.boardgamearena.com/Options_and_preferences:_gameoptions.json,_gamepreferences.json) — MEDIUM
- [Diegetic and Non-Diegetic UI in Games — Nasty Rodent](https://nastyrodent.com/diegetic-and-non-diegetic-ui/) — LOW
- [Papers, Please and Non-Diegetic Morality — Dissecting Game Design](https://dissectinggamedesign.substack.com/p/papers-please-and-non-diegetic-morality) — LOW
- [Phantom Doctrine — Wikipedia](https://en.wikipedia.org/wiki/Phantom_Doctrine) — LOW
- [#06 Fonts and Accessibility — Badger Tactics devlog](https://mugule.itch.io/badgertactics/devlog/1657820/06-fonts-and-accessibility) — LOW
- [Typography and Usability in Game Design — Katelyn Lindsey](https://dtc-wsuv.org/klindsey17/typographyFinal/) — LOW
- This repo: `docs/GAME_DESIGN.md`, `docs/ARCHITECTURE.md`, `plan.md`, `.planning/PROJECT.md` — HIGH (primary source for all internal constraints, existing data-model fields, and already-made design decisions cited throughout)

---
*Feature research for: Berlin 1988 v1.1 "Gameplay and UI Refinement" — new in-match UX surfaces*
*Researched: 2026-09-15*
