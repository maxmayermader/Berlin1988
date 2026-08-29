# Feature Research

**Domain:** Realtime multiplayer hidden-movement / simultaneous-secret-order board game web app (lobby + deckbuilder + in-match UI)
**Researched:** 2026-08-18
**Confidence:** MEDIUM overall (LOW-confidence individual web sources, but convergent across many independent implementations — Coup clones, Board Game Arena, webDiplomacy, Jackbox — plus well-established genre conventions the researcher already has high-confidence domain knowledge of: Codenames, Among Us, Diplomacy variants, Slay the Spire / Hearthstone / Marvel Snap deckbuilders)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or unplayable with a group of friends.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Short alphanumeric/numeric **join code** to enter a private lobby | Every code-based multiplayer game (Coup clones, Jackbox, Codenames.game, Among Us) uses a 4-6 character room code as the primary "play with my friends" path. It's the one thing a non-technical player has to type. | LOW | PartyKit room name *is* the join code if you generate a short random slug as the room id — no separate mapping table needed for MVP. |
| **Shareable join link** (code embedded in URL) | Reduces the join code to "click the link" for the common case (Discord/text sharing). BGA forum threads explicitly call out losing a "send people a link" flow as a regression. | LOW | `/lobby/[code]` route; code param does the work. |
| **Public/open lobby browser** | Confirmed as an explicit requirement (Two Spies-inspired: "join by code or from a public list"). Standard for any game wanting a "click and wait for a table" onboarding path (BGA's automatic-mode rationale). | MEDIUM | Needs a lightweight lobby-listing index (which rooms exist, are open, player count) — likely a small KV/DB list PartyKit keeps updated, since PartyKit rooms are otherwise siloed. |
| **Ready-up flow** with visible per-seat ready state | Universal pattern across every lobby system found (Coup clones, BGA, Jackbox): players are shown a roster and each toggles Ready; game only starts once the threshold is met. Players need to *see* who's stalling. | LOW | This project already has a specific threshold rule (≥50% of filled seats) — the UI just needs to expose per-seat state and a visible countdown once threshold is crossed. |
| **Host controls: kick, seat/size config** | Jackbox didn't add kick until Party Pack 9 (2022) after years of user complaints — its absence was a well-documented pain point, not a nice-to-have. A host without the ability to remove a griefer or AFK player is a table-stakes gap, not a polish item. | LOW-MEDIUM | Must also cover the "kick mid-lobby vs. mid-match" distinction; mid-match kicking a human likely just converts the seat to an AI (see below) rather than voiding the match. |
| **AI auto-fill for empty/kicked seats** | Explicit project requirement (solo mode) and also solves the "player disconnects mid-match" problem that every realtime board game app must handle somehow. | MEDIUM | Reuses the existing `packages/ai` bot; UI needs to show "this seat is now AI-controlled" clearly so remaining humans aren't confused about who they're playing against. |
| **In-lobby and in-match chat** | Every social party/deduction game (Jackbox, Coup clones, Among Us) treats chat as core to the social experience, not optional — deduction/bluffing games specifically live and die on table talk. | LOW-MEDIUM | Free text + predefined flavor prompts is already scoped; predefined prompts also double as a lightweight moderation safety valve (no free-text option needed for players who don't want to type). |
| **Countdown-to-start after ready threshold** | Confirmed pattern everywhere ready-up exists — a visible timer after threshold-crossing gives late players a last chance and signals imminent lock-in, avoiding a jarring instant-start. | LOW | Simple client countdown driven by a server timestamp. |
| **Deck/loadout persistence without login** | Project constraint: no accounts for v1, but a player who built a loadout expects it to still be there next session. Every browser deckbuilder (physical-TCG companion apps, web deckbuilders) treats "my deck disappeared" as a critical bug. | LOW | `localStorage`, keyed by a locally-generated player id; the ceiling here is explicitly "don't build cross-device sync," not "don't persist at all." |
| **Deckbuilder: legality/validation feedback in real time** | Every competitive deckbuilder (Hearthstone, Marvel Snap, MTG Arena) surfaces "why can't I add this" the instant a rule is violated (count cap, budget cap, color minimum) rather than at submit time. Berlin 1988 has three simultaneous constraints (10 cards, ≤3 per icon, ≥2 colors, ≤26 BP) that must all be legible at a glance. | MEDIUM | This is a genuinely nontrivial UI problem — see Differentiators; the "table stakes" bar is just "don't let me submit an illegal deck and find out later." |
| **Starter/preset loadouts, one-click load** | Every deckbuilder with build constraints ships presets so new players aren't staring at a blank grid — the game design doc already names four archetypes (Phantom, Hunter, Oligarch, Spider) as the intended on-ramp. | LOW | Data-only feature; presets are already specified in `GAME_DESIGN.md` §6.4. |
| **Round/turn timer with visible countdown** | Standard in every simultaneous-order web implementation with a clock (webDiplomacy, Neptune's Pride-style games): players need to see time pressure, not discover it via a surprise auto-submit. | LOW | Already speced (60s default, host-configurable); UI is a countdown ring/bar plus a "waiting on N players" indicator that never reveals *who*. |
| **"Orders submitted" indicator without revealing content** | This is the single most load-bearing convention across every simultaneous-secret-order implementation (Diplomacy variants, Coup's hidden-role reveal, RoboRally programming phase): show *that* other players have locked in, never *what*. Its absence breaks the core hidden-information promise of the entire genre. | MEDIUM | Needs strict enforcement at the client-state level, not just a UI convention — see Architecture/Pitfalls; this is a fog-of-war boundary as much as a UI feature. |
| **Round resolution playback as a report, not a live simulation** | webDiplomacy and RoboRally-style apps resolve a whole round as one atomic "reveal," then let the player step through *what happened* (movement, strikes, discoveries) rather than animate a live free-for-all. Berlin 1988's own design doc explicitly frames resolution as "played back as one report." | MEDIUM | This is confirmed by the game design doc itself (§7, step diagram: "Resolution... played back as one report") — treat it as a spec requirement, not just a research finding. |
| **Personal "what they know about me" panel (Burn Track)** | Explicitly specified in the game design doc (§6.3): players must be able to audit their own public tells exactly as opponents see them. This is unusual for the genre generally but non-negotiable for *this* game specifically. | LOW-MEDIUM | Straightforward list/log UI once the underlying Burn Track data exists in `PlayerView`. |
| **Node-graph map as the primary board surface** | Table stakes for any hidden-movement game with a graph board (this is the whole genre convention, e.g. Fury of Dracula, Letters from Whitechapel, Two Spies itself) — an abstracted list/table UI instead of a spatial map would break the "read the board" experience the entire ruleset is built around. | HIGH | SVG-based, responsive via the existing `x`/`y` percentage fields already in the node schema (`docs/GAME_DESIGN.md` §3.1) — this is the single biggest UI build in the project. |
| **Match-end / result screen with win condition explanation** | Universal — a match that just stops with no explanation of *why* (extraction vs. elimination vs. score) reads as broken, especially with three distinct win paths. | LOW | Straightforward summary screen; data already exists in engine victory-check output. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable — and should tie back to the Core Value ("go from home page through a complete 14-round match with no gaps").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Deckbuilder budget/constraint visualizer** (live BP meter, icon-count pips, color-requirement checklist) | Most competitive deckbuilders bury constraint feedback in tooltips or error toasts. A persistent, glanceable meter (BP used/26, icon caps as filled pips, color requirement as a checklist) turns "why is this illegal" into something you see before you try, which matters more here than in a typical TCG because Berlin 1988 has *four* simultaneous constraints instead of one. | MEDIUM | Directly serves the design doc's framing of deckbuilding as "the central deckbuilding decision" (active/passive split) — worth investing real design effort here versus treating it as a bolt-on. |
| **Archetype-aware deckbuilder hints** (e.g. flagging "you have 3 actives, 7 passives — this is a scalpel with no armour") | The design doc itself narrates the tension in prose ("Ten slots. Every passive you take is an active you don't have"). Surfacing that narration live in the UI (a small "reading" of the current build) teaches new players the strategic axis instead of leaving them to discover it by losing. | MEDIUM | Pure UI/copy feature over existing deck-validation data; no new engine work. Aligns with `design:ux-copy` skill territory if pursued. |
| **Post-round "what you learned" digest** distinct from the raw resolution log | Rather than just replaying events, explicitly summarize the Signals-phase information a player received this round (adjacency chatter, Radio Intercept, informant reports) as a compact deduction aid — most hidden-movement apps just dump a log and make players reconstruct inference themselves. | MEDIUM-HIGH | Directly supports Design Pillar #1 ("deduction over reflexes") by making the deduction *surface* legible instead of just the raw events. Strong differentiator vs. Two Spies, which the design doc says has none of this apparatus. |
| **AI opponent "tells" surfaced as a personality readout** (not stats, but flavor) | The design doc promises "5 named AI personalities with readable, learnable habits" as a stated advantage over Two Spies ("opponent is a stranger"). A lobby/seat UI that names and briefly characterizes the bot (not just "Bot 1 — Hard") turns the AI work already done in `packages/ai` into a visible product feature instead of an invisible backend. | LOW | Almost pure UI/copy — the personality data already exists; this is presentation, not engineering. High leverage for low cost. |
| **Solo-mode seat visualization** showing which seats are human vs. AI at a glance, live | Reinforces the "solo mode = host fills empty seats with AI" mental model the project already committed to; most competitors treat bot-fill as invisible plumbing rather than a visible, toggleable lobby feature. | LOW | Small lobby-UI addition on top of table-stakes seat list. |
| **Retro CRT/teletype aesthetic applied consistently across lobby, deckbuilder, and match** (not just the map) | The design doc specifies a strong aesthetic pillar (monochrome-green phosphor, monospaced misaligned type, analogue sound) for the *game*, but most competitors' lobby/deckbuilder chrome is generic Bootstrap-style UI bolted onto a themed board. Carrying the theme end-to-end (including the lobby and deckbuilder, not just the map) is a differentiator few hidden-movement web apps bother with. | MEDIUM | Must be reconciled with accessibility (design doc flags this explicitly, §1, cross-ref ARCHITECTURE.md §9) — don't let flavor override contrast/readability requirements. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems, or fall outside this milestone's scope.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| **Live/animated simultaneous movement** (watching all agents glide across the map in real time as orders resolve) | Feels cinematic; "why just show a report when we could animate it" | Genre consensus (webDiplomacy, RoboRally-style apps) and the project's own design doc converge on resolving as one atomic report: live animation of *all* agents simultaneously is visually incoherent (whose move do you watch first?) and — worse — risks leaking information mid-animation before the fog-of-war boundary would otherwise allow it. Also meaningfully higher engineering cost for negative value. | Sequential, ordered step-through of the fixed resolution priority (already specified in §7.2) — reveal information exactly as the rules define it, in the rules' own step order, at the player's own pace. |
| **Global matchmaking / skill-based ELO queue** | "Two Spies eventually added Global Showdown random matchmaking with skill estimates" — tempting to replicate | Explicitly out of scope: no accounts means no durable identity to attach skill/rating to, and the project's stated audience is "a group of friends" playing together, not strangers matched by skill. Building this now is scope creep against a v1 that's already anonymous/local-storage-only. | Public open-lobby browser (table stakes above) covers "find any open game"; defer skill-based matchmaking to a future milestone that also revisits accounts. |
| **Free-text chat with no moderation path** | Simplicity — "just let people type" | A public open-lobby browser means strangers can end up in the same room; unmoderated free text in a public-facing multiplayer surface is a real abuse vector (this is exactly why Jackbox's kick feature and predefined-prompt patterns exist). | Ship the predefined flavor-text prompts as the default-safe channel (already scoped) plus free text, and make sure host-kick (table stakes) is the moderation backstop — don't add a full reporting/moderation system for v1, but don't ship free text with zero mitigation either. |
| **Persistent server-side deck library / cloud save** | "What if I switch browsers" is a reasonable question | Explicitly deferred: cross-device sync depends on accounts, which are explicitly out of scope for this milestone. Building sync infrastructure now duplicates work once accounts land later. | `localStorage` persistence (table stakes above) with an explicit, honest "decks are saved on this device" message in the UI so players aren't surprised. |
| **Rich mobile-optimized responsive layout for the match screen** | "People will want to play on their phone" | Explicitly out of scope per PROJECT.md — a node-graph board with drag/click interactions, a 10-card deckbuilder grid, and a 60-second timer are all meaningfully harder to make good on a small touchscreen, and chasing that now would slow the desktop-first core loop this milestone exists to ship. | Desktop/browser-first; ensure "not broken" on mobile (readable, scrollable, no hard crashes) without investing in touch-optimized interaction design. |
| **In-match voice chat** | Party games (Jackbox) are often played with voice already open (Discord, in person) | Adds real infrastructure (WebRTC signaling, room audio mixing) for a feature most groups already solve out-of-band via Discord/in-person, especially given this project's "friends playing together" framing. | Text chat only (table stakes above); let players bring their own voice channel. |
| **Full custom-rule preset marketplace / user-created game modes** | The lobby already exposes a rich settings surface (map, agents, blockades, etc.) — "let people save and share configs" feels like a natural extension | Real scope expansion: needs a sharing/discovery mechanism, moderation for shared content, and persistence beyond a single player's own device — none of which this milestone's constraints (no accounts, local-storage only) support cleanly. | Host configures settings per-match as already scoped; defer named/shareable presets to a future milestone. |

## Feature Dependencies

```
Home page (create / join / deckbuilder entry)
    └──requires──> Anonymous local identity (player name in localStorage)

Join code + shareable link
    └──requires──> Room creation (PartyKit room = code)

Public open-lobby browser
    └──requires──> Lobby index (list of open rooms, kept in sync with PartyKit rooms)
    └──enhances──> Join code (second discovery path, not a replacement)

Ready-up flow + countdown-to-start
    └──requires──> Seat list with live per-seat state (PartyKit presence/awareness)
    └──requires──> Host controls (seat size, kick) to exist first — ready-up on an unstable roster is meaningless

Host kick
    └──enhances──> AI auto-fill (kicked/disconnected seat converts to bot, doesn't just vacate)

Solo mode (AI fills empty seats)
    └──requires──> AI auto-fill
    └──requires──> Existing packages/ai bot integration (already built)

Deckbuilder (10-card loadout)
    └──requires──> Card/content data already defined in packages/engine/src/content/
    └──requires──> Local persistence (localStorage) to survive between sessions
Deckbuilder budget/constraint visualizer ──enhances──> Deckbuilder (core)
Archetype hints ──enhances──> Deckbuilder budget/constraint visualizer
Starter/preset loadouts ──enhances──> Deckbuilder (lowers the on-ramp cost)

In-lobby deck/class editing ("class" in lobby)
    └──requires──> Deckbuilder (same loadout system, per Key Decision in PROJECT.md)

In-match node-graph map
    └──requires──> PlayerView projection (fog-of-war boundary, already built in packages/engine)
    └──requires──> Node schema x/y percentages (already defined, GAME_DESIGN.md §3.1)

Secret order assignment UI (2 actions per agent)
    └──requires──> In-match node-graph map (actions are declared against nodes/edges)
    └──enhances──> "Orders submitted" indicator (locks in without revealing content)

Simultaneous resolution report / step-through
    └──requires──> Fixed resolution priority order already defined (GAME_DESIGN.md §7.2)
    └──requires──> "Orders submitted" indicator having correctly hidden content pre-reveal
    └──conflicts──> Live/animated simultaneous movement (anti-feature; mutually exclusive approaches to the same moment)

Burn Track ("what they know about me") panel
    └──requires──> Public card-usage log already emitted by engine

Post-round "what you learned" digest (differentiator)
    └──enhances──> Simultaneous resolution report (adds an inference layer on top of raw events)

Match-end / result screen
    └──requires──> Engine victory-check output (already exists)

In-game chat (predefined prompts + free text)
    └──enhances──> Host kick (moderation backstop for free text in a public-lobby context)
```

### Dependency Notes

- **Ready-up flow requires host controls to exist first:** starting a countdown against a roster that can't be pruned (no kick) or resized invites griefing — build seat management before or alongside ready-up, not after.
- **Public lobby browser requires a lobby index, which PartyKit doesn't give you for free:** PartyKit rooms are isolated by design (confirmed by research — presence/awareness is per-room). A public browser needs a small separate mechanism (a lobby-list room, or a lightweight external store) that tracks which rooms exist and are open — this is real, not incidental, work and should be scoped explicitly rather than assumed to fall out of "just add a join code."
- **"Orders submitted" indicator and simultaneous resolution report share one constraint:** both depend on the fog-of-war boundary already enforced in `packages/engine`'s `PlayerView` projection holding at the UI layer too — the client must never receive another player's uncommitted or submitted order content before the Resolution phase, only a boolean "locked in" flag. This is the single highest-stakes UI/architecture seam in the whole milestone (see PITFALLS.md).
- **Live/animated simultaneous movement conflicts with the report-style reveal:** these are two different answers to "how do you show a resolved round," and the project's own design doc has already chosen the report-style answer (§7 diagram). Treat live animation as explicitly rejected, not merely unbuilt.
- **In-lobby deck/class editing depends on the deckbuilder being built as a reusable component**, not a home-page-only page — per the Key Decision already logged in PROJECT.md, this should be one shared UI module mounted in two places (home page, lobby), not two implementations.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches PROJECT.md's Active requirements almost exactly; nothing here should be cut further without renegotiating Core Value.

- [ ] Home page (create / join-by-code / join-from-public-list / deckbuilder entry) — front door, nothing else is reachable without it
- [ ] Deckbuilder with live legality feedback and starter presets — required before a match can start with a non-default loadout
- [ ] Lobby: join code, seat list, ready-up (≥50% threshold), host kick + size toggle, countdown-to-start
- [ ] Solo mode (AI auto-fill of empty seats)
- [ ] In-lobby chat (flavor prompts + free text)
- [ ] In-match UI: node-graph map, secret order assignment, "orders submitted" locking indicator, resolution report step-through, round history/log, Burn Track panel
- [ ] In-game chat (flavor prompts + free text)
- [ ] Match-end / result screen
- [ ] Local-storage persistence for player name and saved decks

### Add After Validation (v1.x)

Features to add once the core loop (home → lobby → full 14-round match → result) is proven to work end-to-end with a real group.

- [ ] Post-round "what you learned" deduction digest (differentiator, layers cleanly on top of the resolution report once that's solid)
- [ ] Archetype-aware deckbuilder hints / narrative build feedback
- [ ] AI personality readout in the lobby seat list (pure presentation layer, cheap to add once bot integration is confirmed working end-to-end in the UI)
- [ ] Deeper CRT/teletype theming pass across lobby and deckbuilder chrome (start functional, add flavor once the loop works)

### Future Consideration (v2+)

Features to defer until this milestone's core loop is validated and, in most cases, until accounts exist.

- [ ] Accounts / login, and anything that depends on them (cross-device deck sync, shareable named presets, skill-based matchmaking)
- [ ] Mobile-optimized touch layout for the match screen
- [ ] Voice chat
- [ ] Moderation/reporting system beyond host-kick

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Node-graph map + secret order assignment | HIGH | HIGH | P1 |
| Lobby (code, seats, ready-up, host controls) | HIGH | MEDIUM | P1 |
| Deckbuilder core (build/edit, validation) | HIGH | MEDIUM | P1 |
| Simultaneous resolution report / step-through | HIGH | MEDIUM | P1 |
| "Orders submitted" locking indicator | HIGH | LOW-MEDIUM | P1 |
| AI auto-fill / solo mode | HIGH | LOW (bot exists) | P1 |
| Match-end / result screen | HIGH | LOW | P1 |
| Lobby + in-match chat | MEDIUM | LOW-MEDIUM | P1 |
| Public open-lobby browser | MEDIUM | MEDIUM | P1 (scoped requirement, but see dependency note on lobby index) |
| Burn Track panel | MEDIUM | LOW-MEDIUM | P1 |
| Deckbuilder budget/constraint visualizer | HIGH | MEDIUM | P2 |
| Post-round deduction digest | MEDIUM | MEDIUM-HIGH | P2 |
| Archetype hints in deckbuilder | MEDIUM | MEDIUM | P2 |
| AI personality readout in lobby | LOW-MEDIUM | LOW | P2 |
| Full CRT theming across all screens | LOW-MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Two Spies (mobile) | webDiplomacy / RoboRally-style apps | Coup web clones / Board Game Arena | Our Approach |
|---------|--------------------|--------------------------------------|--------------------------------------|--------------|
| Join flow | Friend code only, no lobby browser at launch (matchmaking added later) | Public open-game lists, join by browsing | 6-digit code + BGA's dual manual/automatic table flow | Both: private join code/link AND public open-lobby browser (per explicit requirement) |
| Player count | 1v1 only | Varies, often 7 (classic Diplomacy) | 2-8 | 1-4, host-configured, any seat can be AI |
| Simultaneous reveal | N/A (no lobby-scale bluffing/reveal apparatus per design doc) | Reveal-all-at-once report after adjudication | Sequential/hidden-role reveal on action | Fixed-priority resolution report, step-through, per GAME_DESIGN.md §7.2 |
| Deckbuilding | None — fixed ability set | N/A | N/A (fixed roles) | 10-card loadout with live legality feedback — this is a genuine point of differentiation, no direct comparable in the hidden-movement space |
| AI opponents | None at launch (PvP or friend-code only) | N/A | Some clones offer basic bots | 5 named personalities, difficulty-tiered, already built — surface this visibly in the UI as a differentiator |
| Host moderation | N/A (1v1) | Game-admin tools, more heavyweight (multi-week games) | Basic kick in some clones | Kick + auto-AI-fill, lightweight, matches session-length (single sitting) rather than Diplomacy's multi-day cadence |

## Sources

- [Two Spies - App Store](https://apps.apple.com/us/app/two-spies/id1466304408)
- [Two Spies FAQ — playspies.com](https://playspies.com/faq)
- [iCoup / online Coup clones — general web search aggregation](https://coupgame.com/)
- [Coup Multiplayer Online Game (GitHub)](https://github.com/SZZZhang/Coup-Multiplayer-Online-Game)
- [webDiplomacy — orderinterface.php (GitHub)](https://github.com/kestasjk/webDiplomacy/blob/master/board/orders/orderinterface.php)
- [How exactly does one resolve orders simultaneously? — BoardGameGeek](https://boardgamegeek.com/thread/471670/how-exactly-does-one-resolve-orders-simultaneously)
- [Board Game Arena — New lobby update forum thread](https://forum.boardgamearena.com/viewtopic.php?t=28095&start=140)
- [Board Game Arena — Create table for others but you](https://forum.boardgamearena.com/viewtopic.php?t=30100)
- [Deckbuilder UI Design: Best Practices for Card Games](https://www.gunslingersrevenge.com/posts/development/deckbuilder-ui-design-best-practices.html)
- [The Card Games UI Design of Fairtravel Battle — GDKeys](https://gdkeys.com/the-card-games-ui-design-of-fairtravel-battle/)
- [Simulating Simultaneous Movement — Board Game Designers Forum](https://www.bgdf.com/forum/game-creation/mechanics/simulating-simultaneous-movement)
- [Simultaneous Turns — rasie1's blog](https://kvachev.com/blog/posts/simultaneous-turns/)
- [PartyKit — official site](https://www.partykit.io/)
- [PartyKit templates — chat-room README (GitHub)](https://github.com/partykit/templates/blob/main/templates/chat-room/README.md)
- [The Ability To Kick Players... — Jackbox Games blog](https://www.jackboxgames.com/blog/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9)
- [How does Moderation work? — Jackbox Support](https://support.jackboxgames.com/hc/en-us/articles/15794773430295-How-does-Moderation-work)
- Internal: `/Users/maxmay/Documents/GitHub/Berlin1988/docs/GAME_DESIGN.md` (round structure §7, resolution priority §7.2, Burn Track §6.3, loadout construction §6)
- Internal: `/Users/maxmay/Documents/GitHub/Berlin1988/.planning/PROJECT.md` (Active requirements, Key Decisions, Out of Scope)

---
*Feature research for: realtime multiplayer hidden-movement board game web app (lobby, deckbuilder, in-match UI)*
*Researched: 2026-08-18*
