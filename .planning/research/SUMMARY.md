# Project Research Summary

**Project:** Berlin 1988 — milestone v1.1 "Gameplay and UI Refinement"
**Domain:** Hidden-movement game UI and presentation layer (brownfield TypeScript monorepo; pure rules engine, fog projection, AI, and wire protocol already complete)
**Researched:** 2026-09-14
**Confidence:** MEDIUM–HIGH overall — HIGH for engine/architecture/fog claims traced to code reads; MEDIUM for Vercel monorepo specifics and genre UX conventions (externally corroborated, not yet exercised in this repo)

## Executive Summary

v1.1 is fundamentally a **presentation milestone**. The rules engine, fog-of-war projection, AI opponents, and wire protocol are complete and correct (580 tests green at v1.0 close). The 2026-09-14 playtest exposed missing UI surfaces, not missing game logic: `legalOrders()` already computes every legal action and card play, but the client only offers Move, Hold, and an undiscoverable Strike; the server already sends `signals`, full `self` state, every opponent's `agentsAlive`/`eliminated`, and every player's Burn Track, but the client never renders them. Burned agents silently disappear from the board.

**Recommended approach:** sequence by dependency and validation risk. Stand up the Vercel deployment early as a human-verified checkpoint so every later UAT runs against a live URL. Land host settings and new maps before polishing the multi-agent order composer, because `agentsPerPlayer` is hardcoded to `1` today and that masks a latent two-agent Intel-preview bug. The pure-rendering surfaces (status panel, signals log, roster, everyone's Burn Tracks, spectator) have no data gaps and no file overlap with the settings/maps work, so they can run in parallel. The animated replay (highest fog-leak risk) and the visual redesign (a skin over finished surfaces) come last.

**Below-the-UI gaps — only two exist:**
1. **Cross-agent Intel preview.** Two agents share one Intel pool and submit separately. The server's `submitOrder()` already re-validates correctly (`viewWithCommittedSpend` / `intelCostOf` in `packages/engine/src/submitOrder.ts`), but the client has no way to subtract the first agent's committed spend before previewing the second. Fix: export the pure cost calculator from `packages/engine` — no `PlayerView` or protocol change.
2. **`SET_SETTINGS` does not exist.** It is documented in `docs/ARCHITECTURE.md` §5 and `apps/party/src/CLAUDE.md` as if shipped, but it is absent from `packages/shared/src/protocol.ts` and `apps/party/src/handlers.ts`. `createMatch()`, the bots, and the sim harness already honor every `MatchSettings` field — only the "host sets it → `buildMatchConfig()`" wiring is missing.

**Risk tier:** MEDIUM → HIGH during implementation. Presentation-layer fog leaks dominate (a replay inferring opponent movement, a roster implying which agent died, a spectator view that shows more than own fog). The Vercel deployment is the largest environmental unknown: it was never attempted during v1.0 because no Vercel CLI or linked project was available to the executing agent, and STACK.md found `apps/web/next.config.ts` lacks `transpilePackages` for the TypeScript-source workspace packages — a likely first build failure.

## Key Findings

### Recommended Stack

The existing stack (Next.js 15.5.23, React 19.2.0, PartyKit 0.0.115, partysocket 1.3.0, Zustand 5.0.15, Zod 4.4.3, Tailwind v4, Motion 13.1.0) is sound for every v1.1 feature. **One new runtime dependency is recommended:** `radix-ui@1.6.7` (unified package) — unstyled accessible Popover/Dialog/Tooltip primitives for card-detail popovers, target pickers, and the settings panel, styled entirely with Tailwind utilities. Chosen over Base UI (functionally close, but a short stable track record) and React Aria (deeper i18n than this project needs).

**Core technologies:**
- `radix-ui@1.6.7` (new): accessible primitives without a styled kit — fits the token-based Tailwind approach; tree-shaken per import
- `next/font/google` (existing Next feature): self-hosted **Courier Prime** (body/UI monospace) + **Special Elite** (display/stamps only, 16px+) — both SIL OFL 1.1
- Inline SVG `feTurbulence` data-URI + CSS blend modes for paper grain, stamps, redaction bars — static background layer only, never a live filter on an animating element
- Motion 13.1.0 (existing): `useAnimate()` playback controls (`.time`, `.play()`, `.pause()`) cover a skippable, scrubbable replay timeline — no GSAP/Remotion/anime.js
- Map authoring: no new tooling — TypeScript data files following `duel12.ts`, guarded by a new `map-invariants` Vitest suite
- Vercel: Root Directory `apps/web`, include source outside the root directory, `transpilePackages: ['@berlin/shared', '@berlin/engine']`, Node 22+ pinned, `NEXT_PUBLIC_PARTYKIT_HOST` set per environment at build time, a plain git-diff Ignored Build Step (no Turborepo)

**Do not add:** GSAP/Remotion/anime.js, shadcn/ui or any styled component kit, raster grain images, live CSS `feTurbulence` filters, a second display typeface, Turborepo just for ignored builds, a Zod schema for map data, `next/font/local`.

### Expected Features

All eight functional areas are table stakes for this milestone — each one maps directly to a symptom the 2026-09-14 playtest hit or to the milestone's stated "done" condition. The declassified-dossier redesign and the Vercel deployment are committed deliverables alongside them.

**Must have (table stakes):**
- Full order composer: every action/card (Sprint, Wiretap, Bribe, Decoy, Safehouse, Strike, Ambush, silencer purchase), Intel cost and cooldown shown before commit, and a reason shown when an option is unavailable
- Own-status panel: Intel, loadout with cooldowns, passive status, silencers, safehouse, traps, decoys
- Signals log: persistent, re-readable, grouped by round, with map-pinnable clues
- Roster of alive/burned agents for every player, plus every player's Burn Track (not only your own)
- Animated, skippable resolution replay on the map, within fog entitlement
- Spectator view for eliminated players — own fog only
- Host match settings (agents per player, timer, round limit, blockade mode, dossier count), server-enforced, visible to non-hosts
- FFA-16 and FFA-18 maps for 3–4 player matches

**Should have (differentiators):**
- A unified "what they know about me" framing across own-status, roster, and Burn Track
- Redaction bars as the visual metaphor for fog grading (precise for adjacent observers, vague for distant ones)
- Causal replay narration that teaches "shoot where they're going, not where they are"

**Anti-features (do not build):**
- An omniscient "ghost" spectator (the Among Us pattern) — `docs/GAME_DESIGN.md` §8.1 forbids it
- Animating opponent movement paths the viewer never received
- Any client-side legality, cost, or cooldown math that is not the engine's own answer
- Typewriter/manila/stamp treatment on dense data (loadout grid, signals log, Intel/cooldown numbers) — apply it to headers and short labels over a legible information layer

**Defer (not v1.1):** unanimous pause, high-contrast theme, per-seat bot difficulty picker, audio, interactive tutorial, accounts, mobile layout.

### Architecture Approach

The architecture is unchanged: `apps/party` owns the authoritative `GameState`; `apps/web` holds only `PlayerView` and calls `legalOrders()` for predictive legality. Almost every v1.1 feature is `apps/web` rendering of fields that already exist and are already fog-filtered server-side.

**Major components:**
1. **Order composer** (modified: `OrderComposer.tsx`, `ActionSlot.tsx`, `orderDraft.ts`, `TargetOverlay.tsx`, match page) — render the full `legalOrders(view, agentId, prefix)` output for all 9 action types, including card choice and target nodes; cross-agent Intel preview via the new engine cost-calculator export; homes for zero-action Ambush and silencer purchases
2. **Status / signals / roster / Burn Tracks** (new `apps/web` components) — read `view.self`, `view.signals`, `view.opponents`, and `view.burnTracks` directly; never re-filter anything client-side
3. **Resolution replay** (new board-effects layer + replay controls) — `filterEvents.ts` only sends `AGENT_MOVED` for the viewer's own agents, so opponent activity can only appear as anonymous node-level markers on public events; drive it from the same `reveal` cursor `StepThrough` uses, with no second event renderer
4. **Spectator** (modified: match route) — no engine or protocol change: `apps/party` already treats eliminated connections like any seat, and `projectView()` yields an empty `visibleNodes` plus the public event branch; v1.1 adds an explicit "eliminated — watching" state instead of the generic "No living agents" message
5. **Host settings** (new `SET_SETTINGS` in `packages/shared` protocol + `apps/party` handler, modified `buildMatchConfig()`) — server-side validation, broadcast to all seats, applied at `startMatch`
6. **Maps** (new `ffa16.ts`, `ffa18.ts` + `MAPS` registry entries + a `mapId` selection rule in `buildMatchConfig()`) — `createMatch()`, `packages/ai`, and golden tests are map-agnostic; existing golden fixtures are pinned to `duel-12` via `quickSettings()` and should not churn
7. **Theme** (modified `apps/web/app/globals.css` + component sweep) — establish the token set first, then replace the hardcoded hex colors scattered across components

### Critical Pitfalls

Numbers refer to `PITFALLS.md`, which lists 17.

1. **Replay animates something the viewer never received (Pitfall 1)** — an animator wanting a "complete" story invents opponent paths from public breadcrumbs. **Prevent:** animate only public node-level markers; write a fog-leak regression test before any animation logic lands.
2. **Roster and signals reveal death by omission or inference (Pitfall 2)** — e.g. which specific agent burned. **Prevent:** render only what `OpponentPublicInfo` and the filtered events carry (counts, not identities); extend the existing wire-level fog scan to the new surfaces.
3. **Cross-agent Intel double-spend in the client preview (Pitfall 7, with 6)** — agent A and agent B each look affordable against the same pre-spend Intel; the server correctly rejects B and the player has no idea why. **Prevent:** the exported engine cost calculator subtracts A's committed cost before previewing B; a dedicated two-agent UAT scenario.
4. **Host-settings validation bypass and state conflicts (Pitfalls 13, 4, 12)** — client-only validation, settings changed after ready-up, placebo controls for fields nothing honors, a snapshot leaking loadouts, the wrong map for the seat count. **Prevent:** server re-validates every field; PITFALLS.md recommends un-readying seats (or requiring re-confirmation) when settings change after ready-up; audit every `MatchSettings` field before exposing a control; keep loadouts out of lobby snapshots.
5. **Vercel monorepo deployment failures (Pitfall 17)** — workspace TypeScript resolution, Node version, build-time `NEXT_PUBLIC_*` inlining, Preview builds pointing at the production PartyKit host, `wss://` scheme, CLI/auth availability for an automated agent. **Prevent:** an explicit human-verified checkpoint early in the milestone; a clean local build with Vercel's commands first; decide the staging question up front.

Also material: movement-first ordering breaking Strike/Ambush/Bribe targeting (8); Strike-vs-Move click ambiguity and zero-action purchases lost in a slot-centric UI (9); the 2-agent round-clock squeeze with no pause, and replay length vs. the next round's clock (10); new maps shifting balance or bot behavior silently (11); WCAG AA failures on manila backgrounds and lost non-color sector encoding (14); E2E selectors and static hex-color tests breaking in the redesign (15); the "Burn Track" vs. "burned" naming collision (16).

## Implications for Roadmap

A suggested structure for the roadmapper, not a decision. The researchers proposed different orderings (FEATURES.md: composer first, redesign last; ARCHITECTURE.md: deploy first, settings + maps before composer multi-agent polish, rendering surfaces parallel; PITFALLS.md: deploy as an early human-verified checkpoint, pair settings with maps). The reconciliation below respects all of their dependency constraints; the roadmapper may split phases more finely, e.g. deployment as its own phase.

### Phase 1: Infrastructure checkpoint — deploy, host settings, maps
**Rationale:** Settings + maps unlock real 2-agent, 3–4 player play, which surfaces the latent cross-agent Intel bug while the composer is still to be built. The deployment unblocks live-URL UAT for everything after it and closes v1.0's open human-verification gaps.
**Delivers:** `apps/web` live on Vercel against the production `apps/party`; host-configurable match settings; FFA-16 and FFA-18 selectable for 3–4 players; a `pnpm sim --matches 300 --profile` sweep on each new map (optionally new-map golden fixtures)
**Addresses:** host settings, new maps, Vercel deployment, v1.0 UAT gaps
**Avoids:** Pitfalls 4, 11, 12, 13, 17

### Phase 2: Core gameplay surfaces
**Rationale:** The composer must follow settings (so 2-agent play is testable). Status, signals, roster, Burn Tracks, and spectator have zero data gaps and no file overlap with Phase 1, so they can run in parallel with it or with the composer.
**Delivers:** every action and card playable with cost/cooldown preview; own-status panel; signals log; roster of alive/burned agents for every player; every player's Burn Track; explicit spectator state for eliminated players
**Uses:** `radix-ui` primitives; the engine cost-calculator export
**Addresses:** order composer, own-status, signals, roster + Burn Tracks, spectator
**Avoids:** Pitfalls 2, 3, 5, 6, 7, 8, 9, 16

### Phase 3: Resolution replay + visual redesign
**Rationale:** The replay carries the highest fog-leak risk and benefits from a feature-complete composer to test against. The redesign is a skin best applied once the functional surfaces exist; if run as a rolling convention instead, the token set must be established before any new component is written.
**Delivers:** animated, skippable map replay naming actors within entitlement; declassified-dossier visual language across every screen; a WCAG 2.1 AA pass; updated Playwright selectors and static-source tests
**Uses:** Motion 13 `useAnimate()`, SVG grain, Courier Prime + Special Elite
**Addresses:** animated replay, visual redesign
**Avoids:** Pitfalls 1, 10, 14, 15

### Phase Ordering Rationale

- **Deployment early:** v1.0's top retrospective lesson — a deploy-dependent checkpoint silently rode across four phases. Everything after it verifies against a live URL.
- **Settings + maps before composer multi-agent work:** `agentsPerPlayer: 1` is hardcoded today, which hides the cross-agent Intel bug the composer must handle.
- **Rendering cluster is free to parallelize:** status/signals/roster/Burn Tracks/spectator read existing `PlayerView` fields unconditionally and cannot be broken by decisions in the settings/maps/composer track.
- **Replay after the composer:** it needs a rich set of real events to animate and test against, and its fog-leak test should be written first.
- **Redesign last (or token-first rolling):** avoids hand-styling each new component twice.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 — Vercel deployment:** unvalidated in this repo; needs the staging decision and a human checkpoint with a real multi-browser session.
- **Phase 1 — New maps:** node layout of FFA-16/FFA-18 is new content; dossier count and balance need sim confirmation.
- **Phase 3 — Animated replay:** fog-leak hotspot; exactly which events can be visualized, and how, needs design before code.

Phases with standard patterns (research can be light):
- **Phase 2 — Status / signals / roster / Burn Tracks / spectator:** pure rendering of existing fields.
- **Phase 3 — Token refactor + hex sweep:** mechanical; the only novel risk is WCAG contrast over paper texture.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM–HIGH | `radix-ui`, `next/font`, and Motion APIs verified against official docs; the Vercel monorepo recipe is well documented but unvalidated in this repo |
| Features | MEDIUM–HIGH | Table stakes grounded in the playtest and `PlayerView` code reads (HIGH); genre conventions corroborated by reference games (MEDIUM); diegetic-UI legibility trade-offs rest on weaker sources (LOW, flagged in FEATURES.md) |
| Architecture | HIGH | Every integration point traced to specific files; both below-the-UI gaps confirmed absent in code |
| Pitfalls | HIGH / MEDIUM | Fog and engine-drift pitfalls grounded in code and v1.0's own leak history (HIGH); Vercel and WCAG specifics corroborated externally (MEDIUM) |

**Overall confidence:** MEDIUM–HIGH — solid for the UI and integration work; the deployment and a handful of product decisions need explicit resolution.

### Gaps to Address

1. **Burn Track naming collision** — "Burn Track" (card-use history) vs. "burned" (agent killed). FEATURES.md proposes a UI-copy rename (e.g. "Known Capabilities" or "Dossier on You"), keeping internal type names to avoid protocol churn and reserving "burned" for agent death. **Decision needed:** UI-copy only, or also update `docs/GAME_DESIGN.md` vocabulary?
2. **Spectator fog semantics** — ARCHITECTURE.md verified that an eliminated player today receives an empty `visibleNodes` plus public events only (fog-safe, no engine change needed), which makes for a near-blank board. PITFALLS.md asks for an explicit decision rather than an assumption. **Decision needed:** is "public events + roster + Burn Tracks + own history on a bare map" the intended spectator experience, or should spectators keep their last-known map state?
3. **Map selection** — ARCHITECTURE.md recommends deriving `mapId` from seat count (1–2 → `duel-12`, 3 → `ffa-16`, 4 → `ffa-18`, matching `docs/GAME_DESIGN.md` §3.1) as the safer default. **Decision needed:** derived only, or a host choice with validation?
4. **Staging PartyKit for Vercel Preview** — Preview builds need a `NEXT_PUBLIC_PARTYKIT_HOST`. **Decision needed:** stand up a staging PartyKit deployment, or accept Preview pointing at production for v1.1?
5. **Dossier-count tuning for FFA-16/FFA-18** — `dossierCount: 2` was tuned for the duel map. **Gate:** sweep `pnpm sim --matches 300 --profile` on each new map across dossier values and compare against the Duel-12 baseline before humans play them.
6. **Round-timer defaults for 2-agent play** — the design default is 60s, the room currently uses 90s, and pause is out of scope. PITFALLS.md flags the 4-actions-under-one-clock squeeze as never measured. **Gate:** choose host-setting defaults with this in mind and measure real submission times during Phase 1 UAT.

## Sources

### Primary (HIGH confidence)
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md`, `.planning/research/FEATURES.md` (v1.1, 2026-09-14)
- Code reads cited by those files: `packages/engine/src/legalOrders.ts`, `submitOrder.ts`, `fog/projectView.ts`, `fog/filterEvents.ts`; `packages/shared/src/view.ts`, `orders.ts`, `protocol.ts`, `settings.ts`; `apps/party/src/handlers.ts`, `settings.ts`; `apps/web/components/orders/OrderComposer.tsx`, `apps/web/lib/orderDraft.ts`, `apps/web/next.config.ts`
- Project docs: `docs/GAME_DESIGN.md`, `docs/ARCHITECTURE.md`, `plan.md`, `.planning/RETROSPECTIVE.md`, `.planning/codebase/CONCERNS.md`
- Official documentation: nextjs.org, radix-ui.com, motion.dev, vercel.com/docs (monorepos, environment variables, build configuration)

### Secondary (MEDIUM confidence)
- Vercel community reports on pnpm workspace + Next.js monorepo gotchas
- Genre reference games for targeting, clue logs, rosters, and replay: Two Spies, Frozen Synapse, Into the Breach, Scotland Yard, Fury of Dracula, Specter Ops, Among Us, Board Game Arena
- WCAG 2.1 AA contrast guidance for textured backgrounds

### Tertiary (LOW confidence)
- Diplomacy-client adjudication views and diegetic "document" UI references (Papers, Please; Orwell; Her Story; Phantom Doctrine) — weak or single-source, flagged per row in FEATURES.md
- `radix-ui` vs. Base UI trade-off discussions

---
*Research completed: 2026-09-14*
*Ready for requirements definition: yes*
