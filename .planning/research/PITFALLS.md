# Pitfalls Research — v1.1 Gameplay and UI Refinement

**Domain:** Adding a full order composer, status/signals/roster surfaces, animated resolution replay, spectator view, host settings, new maps, and a visual redesign to an existing simultaneous-turn hidden-movement game (pure TypeScript engine + authoritative PartyKit room + Next.js client), plus first Vercel deployment
**Researched:** 2026-09-14
**Confidence:** HIGH (engine/fog/protocol pitfalls, grounded directly in `packages/engine/src/fog/*`, `packages/shared/src/view.ts`, `apps/party/src/handlers.ts`, `apps/web/components/orders/OrderComposer.tsx`); MEDIUM (Vercel monorepo and WCAG specifics, corroborated by external sources but not yet exercised against this exact repo)

---

## Critical Pitfalls

### Pitfall 1: Resolution replay animates something the viewer never received

**What goes wrong:**
The replay renderer reaches past `PlayerView.lastRound`/`PlayerView.history` (already fog-filtered per `docs/ARCHITECTURE.md` §4.1/§5) and pulls in something richer — e.g. re-deriving "who moved where" from the live `visibleNodes` state at the *end* of the round, or naming an agent id that a dropped/redacted event never carried. This is the single easiest way to reopen the exact class of bug Phase 1 already found and fixed (`STRIKE_FIRED`/`AMBUSH_TRIGGERED` originally shipped stable agent ids to opponents) and the class Phase 4's research explicitly investigated (naive round-history re-filtering against a viewer's *current* state mis-grades a historical `STRIKE_FIRED`'s audibility).

**Why it happens:**
`filterEvents()` (`packages/engine/src/fog/filterEvents.ts`) drops non-entitled events rather than blanking them, and rewrites `AGENT_BURNED`/`AMBUSH_TRIGGERED`/`DOSSIER_TAKEN`/`STRIKE_FIRED` to null out identity fields the viewer isn't owed. An animator that wants a *complete-feeling* story (e.g. "someone must have moved to end up there, let me interpolate a path") will be tempted to backfill the missing piece from other state it happens to have in scope — the current `GameState`-shaped view, a previous round's cached opponent position, or a Zustand store that still holds last round's `visibleNodes`. Any of these reintroduces exactly the leak the type system was built to make unrepresentable.

**How to avoid:**
- The replay component's only allowed inputs are `PlayerView.lastRound` (for the round just resolved) and `PlayerView.history[n]` (for scrubbing back) — never `GameState`, never a locally reconstructed opponent trajectory.
- Treat "the event isn't in the array" as "nothing to animate," not as "infer it." A dropped `AGENT_MOVED` for an opponent means the replay shows nothing there, not a guessed path.
- Add a fog-leak-style test for the replay's rendered output specifically: build a `PlayerView` for player B, resolve a round where player A moved/struck/took a dossier, and assert the rendered replay text/DOM for B's view contains no A-owned node id, agent id, or the word describing A's action beyond what `filterEvents` already permitted (mirrors `packages/engine/tests/fog-leak.test.ts`, but at the presentation layer where a leak scan has never run before).
- Reuse the "filter once, at the moment of truth, store the answer" pattern the project already established for `burnTracks` and round `history` (Key Decision in PROJECT.md) — the replay must consume that pre-filtered array, not re-derive anything at render time.

**Warning signs:**
- Replay code importing `@berlin/engine`'s `GameState`-shaped types, or a prop threading in more than `PlayerView` plus the one round's `ResolutionEvent[]`.
- Any "smooth path" interpolation logic that computes an opponent's intermediate node without that node appearing in an event the viewer was entitled to.
- A code review comment like "we already know they went from X to Y, just animate it" — that knowledge came from somewhere not in the projected view.

**Phase to address:**
The phase implementing the animated resolution replay (target feature 3). This needs a dedicated fog regression test written *before* the animation logic, per the v1.0 pattern (Phase 4's research found the bug before planning; the plan-checker/code-reviewer explicitly re-verified the fix was implemented, not just described).

---

### Pitfall 2: Roster and signals feed reveal death by omission or inference

**What goes wrong:**
`OpponentPublicInfo` already exposes `agentsAlive`, `agentsTotal`, and `eliminated` (packages/shared/src/view.ts) — those fields are legitimately public per the design (a roster showing "1/2 alive" for an opponent is intended, not a leak). The pitfall is a UI that goes further: e.g. showing *which* of an opponent's two agent slots died (when the engine deliberately never assigns stable, player-facing identity to unowned agents — see `filterEvents`'s comment on why agent ids are nulled for non-owners), or a signals-feed entry that infers "Agent B must be the one that died because Agent A was seen crossing a checkpoint two rounds ago." That correlation is exactly what the Phase 1 `STRIKE_FIRED`/`AMBUSH_TRIGGERED` stable-id bug would have enabled, now re-created at the UI layer through inference rather than raw data.

**Why it happens:**
The temptation comes from wanting a richer roster ("Agent Alpha: alive, Agent Bravo: burned") when the engine only gives `agentsAlive: 1, agentsTotal: 2` for opponents. A UI author fills the gap by assigning stable per-agent labels to opponent agents client-side and tracking them across rounds — which recreates the correlation the engine explicitly redacts.

**How to avoid:**
- For opponents, render agent slots as anonymous/interchangeable count state only ("1 of 2 agents remaining"), never as persistently labeled individual agents. Reserve individually-labeled agent chips for `self`.
- Any signals-log entry that names an opponent's agent must trace back to a `Signal` or `ResolutionEvent` field the viewer actually received (e.g. a `BURN` public event, an `AGENT_BURNED` with nulled `agentId`) — never a client-side running tally.
- Extend the fog-leak test suite (or add a UI-layer equivalent) to assert that no two roster renders across consecutive rounds for the same opponent allow a viewer to distinguish "agent 1 died" from "agent 2 died" when the engine didn't say so.

**Warning signs:**
- A component prop or store slice typed as `OpponentAgent[]` with a stable `id` field sourced from anywhere other than `self.agents`.
- Roster UI mockups/specs that show opponent agents with names, portraits, or fixed positions in a list that persists identity across rounds.

**Phase to address:**
The phase building the alive/burned roster and signals log (target features 2–3). Verification: a UAT scenario where two agents on the same opponent are both alive, one burns, and the tester confirms the roster cannot be used to tell which specific agent (by any earlier-observed trait) burned.

---

### Pitfall 3: Spectator view for eliminated players reveals full state instead of frozen own-fog

**What goes wrong:**
"Spectator view for eliminated players (own fog only)" — per `docs/GAME_DESIGN.md` §8.1, an eliminated player "stay[s] in the room as spectators, seeing only what their own fog allowed them to see while alive." The natural, wrong implementation is to give a spectator either (a) a live, unfiltered `GameState`-style read of the whole match since "they can't affect the outcome anyway," or (b) a `projectView()` call keyed to their own `playerId` that keeps evaluating vision/informants/signals as if they were still an active participant — which could accidentally *grow* their fog after death (e.g. their dead agent's old informant node re-activating a live income feed, or blockade schedule/`Kontrolle Schedule` foreknowledge continuing to update against the current round when it should be frozen at the moment of elimination).

**Why it happens:**
There is no existing code path for this — `projectView` and `visibility.ts` were built for active players. Spectator mode is new surface area, and the fastest implementation is "just don't stop calling projectView for them," which silently keeps their vision live and current rather than "what they earned while alive."

**How to avoid:**
- Decide explicitly, in the phase's design step, whether a spectator's fog is (a) frozen at the moment of elimination (matches "seeing only what their own fog allowed them to see while alive" literally) or (b) still live but computed as if their agents were still where they died (their last-known vision radius, informants, etc., continuing to report). The design doc's wording ("while alive") suggests (a); pick one and encode it as an explicit engine-level concept, not an ad hoc client filter.
- Whichever is chosen, it must still be `projectView`-shaped output — a spectator screen must not become a second code path that constructs a view by hand. If elimination requires new `PlayerView` semantics (e.g. `visibleNodes` stops updating), that change belongs in `packages/engine/src/fog/`, reviewed as the security change `packages/engine/src/fog/CLAUDE.md` calls for, not bolted onto `apps/web`.
- Run the existing fog-leak scan against post-elimination `GameState`s specifically — the scan currently exercises "randomized states," but confirm elimination is one of the randomized dimensions, not just alive-player states.

**Warning signs:**
- A spectator component receiving a full `GameState` prop "because they can't act anyway."
- `projectView` called with an eliminated player's id and returning `visibleNodes` that grow richer after their last agent burned (e.g. inheriting visibility from other still-informant-owning state that shouldn't still be theirs).
- No explicit engine test named something like `spectator-fog.test.ts`.

**Phase to address:**
The phase implementing spectator view (target feature 5). This is engine-adjacent work (a `packages/engine/src/fog/` change), not purely a UI phase — flag it for the deeper research the milestone context calls out, and gate it behind a new fog-leak-style regression test before UI work begins.

---

### Pitfall 4: Host-settings snapshot leaks a player's loadout to other seats

**What goes wrong:**
A host-settings panel that shows "who's ready" or "who's picked a loadout" is tempting to build by echoing back seat state that includes loadout contents (card ids, archetype, color affinity) to every connection in the lobby — e.g. a `ROOM_STATE` broadcast that grew a `seats[].loadout` field for host visibility, or a lobby UI that fetches "my opponent's deck" to render a "ready" checkmark with a tooltip. `handleSubmitLoadout` in `apps/party/src/handlers.ts` already documents the correct discipline ("No ROOM_STATE broadcast follows a loadout write: the public lobby snapshot carries nothing derived from a seat's loadout") — the risk is a *new* host-settings feature reintroducing exactly this by adding a settings-and-seats combined view that wasn't audited the same way.

**Why it happens:**
Host settings and seat/ready state naturally live in the same `RoomState` object server-side. A UI author building "host configures settings + sees seat readiness in one screen" can pull both off the same `ROOM_STATE` message without re-checking which fields of `RoomState` are safe to broadcast wholesale versus which need per-recipient projection (loadout is per-seat private until match start, same category of secret as an agent's card cooldowns once in-match).

**How to avoid:**
- Treat any new field added to the lobby broadcast payload as a security change, the same review discipline `packages/engine/src/fog/CLAUDE.md` mandates for `PlayerView` — even though this is `apps/party` lobby state, not engine state, because the same "everyone in the room receives every broadcast" chokepoint (`broadcast.ts`) is at stake.
- Keep `SET_SETTINGS`/host-settings messages scoped to `MatchSettings` fields only (agent count, timer, round limit, blockade mode, dossier count) — never merge them with per-seat loadout data in the same outbound message or the same React prop, even if it's convenient to compose one settings-and-lobby screen.
- Add a test (mirroring `handleSubmitLoadout`'s existing comment/behavior) asserting the `ROOM_STATE`/settings broadcast payload for host-settings changes contains no `loadout` field for any seat other than the recipient's own — extend the existing fog-adjacent discipline into `apps/party/src/state.ts`'s serialization.

**Warning signs:**
- A `RoomState`-derived type sent to the client that includes `loadout` or `cards` alongside `settings`.
- Host-settings UI mockups that show "Player 2: loadout locked (Hunter archetype)" rather than just "Player 2: ready."

**Phase to address:**
The phase implementing host match settings (target feature 6). Verify with a protocol-level test on the broadcast payload, not just a UI check.

---

### Pitfall 5: Client-side re-filtering of history against current state (the v1.0-documented leak)

**What goes wrong:**
Any new UI surface that reads `PlayerView.history` (or `lastRound`) and re-derives display facts by cross-referencing them against the *current* `PlayerView` — e.g. a "who's near me now" overlay on the replay timeline, or a signals-log entry that upgrades a historical `STRIKE_VICINITY` to `STRIKE_EXACT` because the viewer's agent happens to be adjacent to that node *this* round — reintroduces the exact bug Phase 4's research caught and fixed for round history itself. `docs/ARCHITECTURE.md` and the Key Decisions in PROJECT.md are explicit: history must be filtered exactly once, at round-resolution time, and never re-graded against a newer `GameState`.

**Why it happens:**
`history` is a flat array of already-filtered `ResolutionEvent[]` per round, but nothing in the type system prevents a component from also holding the *current* `PlayerView` in scope and computing something that mixes the two — e.g. "was node N adjacent to any of my agents" using this round's agent positions applied to a review of last round's strike. This is subtle because the component isn't touching `GameState` directly; it's combining two pieces of already-fog-safe data in a way that produces a fog-unsafe conclusion.

**How to avoid:**
- Apply the "filter once, store the answer" pattern to every *new* history-adjacent feature exactly as it was applied to `burnTracks` and `history` — if a display fact about a past round needs to be computed, it must be computed once by the engine at that round's resolution and included in the stored event/signal, never recomputed client-side using current-round context.
- Explicitly test: move a viewer's agent adjacent to an old strike/ambush/informant node in a *later* round, then assert the earlier round's replay/log entry still reports its original (frozen) grading — this is the literal regression test Phase 4 wrote; any new component touching `history` should be run through the same scenario.
- Any function in `apps/web/lib/` that accepts both a past round's events and the live `PlayerView` as separate arguments is a code-review flag — ask why it needs both.

**Warning signs:**
- A `useMemo`/selector combining `history[i]` with `view.self.agents` (current) rather than only with data already inside `history[i]`.
- A "distance from strike to my current position" style computation applied to a historical event.

**Phase to address:**
Any phase touching the replay, signals log, or roster history (target features 2–4). Reuse the exact regression-test shape already established in v1.0's history feature; don't rediscover the reasoning.

---

### Pitfall 6: UI re-implements Intel cost / cooldown math instead of asking `legalOrders()`

**What goes wrong:**
A "cost and cooldown preview" for every action and card is tempting to build as a small client-side lookup table (icon → Intel cost, icon → cooldown rounds, read once from `content/cards.ts` and displayed statically), rather than deriving it from what `legalOrders()` (or the underlying `isReady`/`cardUsable`/`intelLeft` logic it already encapsulates) says is true *right now, in this composition sequence*. `legalOrders.ts` computes affordability against `intelLeft = self.intel - sim.intelSpent` (Intel already committed by earlier slots or the other agent) and `cardUsable` (cooldown-ready **and** not already used in this same prefix) — a static table can't reproduce either of those without re-implementing `simulatePrefix`.

**Why it happens:** Card cost/cooldown feels like static content data, so building a preview panel against `content/cards.ts` directly seems reasonable and is even faster to render. It silently drifts the moment a card is affordable in isolation but not in sequence (e.g. after Sprint already spent 3 of your 4 Intel).

**How to avoid:**
- The cost/cooldown preview must be sourced from the same `legalOrders(view, agent, prefix)` call the composer already uses to populate the picker, not a separate static lookup. If a card doesn't appear in `legalOrders`'s output for the current prefix, its preview must show "unavailable now," never a generic static cost that implies it's playable.
- For cards that *are* offered, compute the displayed Intel cost/cooldown from the same fields `legalOrders` reasoned from (`view.self.cooldowns`, `intelLeft`), not from `content/cards.ts` alone, so a future ruleset or affinity-bonus change can't make the preview and the engine disagree.
- Add a UI-layer test: for a fixed `PlayerView` fixture, assert every cost/cooldown number rendered in the composer matches a value derivable from `legalOrders`'s own output plus `view.self.cooldowns`, not from an independently maintained constant.

**Warning signs:**
- A new `lib/cardCosts.ts` or similar that imports `content/cards.ts` and formats costs without taking a `PlayerView`/prefix.
- A cost preview that still shows a normal cost for a card `legalOrders` has actually excluded from this slot's options.

**Phase to address:**
The phase building the full order composer (target feature 1). This is the phase's central risk — `CLAUDE.md`'s "Anti-Patterns" section already names "reordering the eleven resolution steps" as sacred; the equivalent rule for this phase is "never re-derive what `legalOrders` already computed."

---

### Pitfall 7: Cross-agent Intel double-spend when two agents' orders are composed/submitted separately

**What goes wrong:**
With 2 agents sharing one Intel pool, composing agent A's order against `projectView()` and agent B's order against a *separately fetched* `projectView()` (rather than `viewForOrdering()`) lets both orders independently pass legality (each sees the full, pre-spend Intel total) but together overspend. `packages/engine/CLAUDE.md` calls this out explicitly: "Using `projectView` here produces orders that pass legality checks individually and overspend together." The server's `submitOrder()` is the actual backstop (it re-validates against updated `GameState.players[id].intel` after agent A's order lands), so this can't corrupt match state — but the *client preview* will show both agents' actions as affordable, then the second `SUBMIT_ORDER` comes back `ORDER_REJECTED` from the room, and the human has no idea why a legal-looking action was refused.

**Why it happens:** `viewForOrdering(state, player, agentId)` exists precisely for this, but it's easy to overlook when building a two-agent composer that treats each `AgentSwitcher` tab as "just render the same view again" — `projectView` and `viewForOrdering` return the same shape (`PlayerView`), so nothing type-checks the mistake away; it's a naming/semantics trap, not a compile error.

**How to avoid:**
- The order composer must call `viewForOrdering(state-equivalent, playerId, agentId)` — or, since the client only ever has a server-sent `PlayerView` rather than raw `GameState`, must locally re-simulate agent A's already-committed-but-not-yet-submitted actions against agent B's `legalOrders` prefix, exactly mirroring what `viewForOrdering`/`simulatePrefix` does server-side. In practice: the client's local draft state for agent A's two actions must be folded into the `intelLeft` calculation shown for agent B, before agent B's order is even drafted, not just before submission.
- Because the client only receives `PlayerView` (never raw `GameState`), and `viewForOrdering` is an engine-internal-facing function, this needs an explicit design decision in the phase: does the client ask the server for a live view *per agent switch*, or does it locally track "Intel already committed by agent A's draft" and subtract it before calling `legalOrders` for agent B? The safer default is the latter — track spend across both agents' drafts in one client-side reducer, subtract from `view.self.intel` before passing an effective view (or an effective `intelLeft` parameter) into agent B's `legalOrders` call.
- Add an integration test: draft agent A spending most of the Intel pool, switch to agent B, assert the composer's own affordability preview for agent B already reflects the reduced pool — and separately, a room-level test asserting `SUBMIT_ORDER` for agent B after agent A's order landed correctly rejects an overspend the client preview should have already blocked.

**Warning signs:**
- Two `legalOrders()` calls in the composer, one per agent tab, each fed `view.self.intel` directly rather than a pool that accounts for the other agent's in-progress draft.
- `ORDER_REJECTED` (Intel-related) showing up for a second agent's submission with no client-side explanation, because the composer let the human draft something the server was always going to refuse.

**Phase to address:**
The phase building the full order composer (target feature 1), specifically the 2-agent path. `apps/web/components/CLAUDE.md`'s rule "Two agents is the default, one is a setting" makes this the phase's hardest correctness requirement, not an edge case.

---

### Pitfall 8: "Movement must be declared first" ordering silently breaks the composer's Strike/Ambush/Bribe targeting

**What goes wrong:**
`legalOrders.ts` stops offering `MOVE`/`SPRINT` once a `STRIKE` or `BRIBE` is in the prefix for that slot sequence (because both resolve from the post-movement node per pipeline step ordering — `docs/GAME_DESIGN.md` §4/§7.2). A composer that lets a player pick actions in *arbitrary* UI order — e.g. "click Strike first, then realize you want to move first and try to insert a move before it" — either has to support retroactive reordering of already-assigned slots (complex, and the engine has no concept of "insert before"), or it silently produces the same order-of-operations confusion the design doc calls out ("a strike picked first would silently go out of range once a move was added after it"). The comment in `OrderComposer.tsx` already reflects the correct pattern (never assemble a locally-invented action list; always ask `legalOrders`), but a v1.1 expansion to *all* actions/cards is exactly where a well-intentioned UX improvement ("let players freely reorder their two actions before committing") could reintroduce this.

**Why it happens:** Two ordered slots feel like they should be freely reorderable in a good UX (drag to swap slot 1 and slot 2) — but the underlying engine model isn't "two arbitrary actions I later sequence," it's "commit slot 1, then slot 2 is legality-checked against slot 1's effects." Reordering after the fact requires re-running `legalOrders` for the new slot 1 with an empty prefix and the new slot 2 with the new slot-1 prefix — trivial to get subtly wrong (e.g. reusing cached legality data from the old ordering).

**How to avoid:**
- If the composer allows slot reordering (e.g. drag-and-drop), reordering must **clear both slots' committed actions and re-run `legalOrders`** for the new sequence from scratch — never just swap the two `Action` objects in the draft array. `Action` objects computed for "slot 1 with empty prefix" are not valid for "slot 2 with a different prefix," even if they look identical (an `AMBUSH` action, for instance, has different Intel/slot-cost implications depending on position).
- Communicate the "movement must be declared first" constraint at the UI level directly — once a Strike or Bribe is chosen for a slot, grey out / hide Move and Sprint options for the *other* slot too, if that slot comes after (this is what `legalOrders` will already do; the UI failure mode is confusing the player about *why* Move disappeared, not incorrectly allowing it).
- Keep the `OrderComposer` comment/discipline ("every option offered here is exactly what `legalOrders()` returned for this slot — never a locally assembled list") as a standing rule for every new action/card type added in this phase, not just the ones that existed at Phase 1's tracer-bullet scope.

**Warning signs:**
- Any client-side `Action[]` construction that isn't the direct return value of a `legalOrders()` call for that exact `(agent, prefix)` pair.
- A "swap slots" or "edit slot 1 after slot 2 is filled" UI affordance implemented as an array swap rather than a full redraft-and-relegalize.

**Phase to address:**
The phase building the full order composer (target feature 1).

---

### Pitfall 9: Strike-vs-Move ambiguity on a node click, and zero-action Ambush/silencer purchases getting lost in an action-slot-centric UI

**What goes wrong:**
Two distinct issues under one UI surface:
1. **Strike-vs-Move ambiguity.** Clicking an adjacent node is ambiguous between "Move there" and "Strike there" (Mode A strike targets the agent's own node or an adjacent one, and the agent *advances into* the target node as part of the action — `docs/GAME_DESIGN.md` §5.1). A board-click interaction model that infers the action type from which node was clicked, without an explicit mode selector, will either always resolve to Move (making Strike undiscoverable — this is literally what the v1.1 trigger playtest found: "Strike" was "undiscoverable") or require a modifier click that isn't documented anywhere.
2. **Zero-action purchases disappearing.** Ambush (when `ambushCostsAction` is off, the current default) and silencer purchases cost Intel but consume **no action slot** — `legalOrders.ts` enumerates them as "free actions" available even when `slotsLeft <= 0`. A composer built around "fill slot 1, fill slot 2, submit" has no natural home for an action that isn't a slot. If the UI only ever renders the two action slots as the sole way to add anything to an order, Ambush and silencers become invisible even though `legalOrders` already returns them — recreating the same "engine supports it, UI never surfaces it" gap the v1.1 trigger playtest found for every non-Move/Hold/Strike action.

**Why it happens:** The Phase 1 tracer-bullet composer only had to support Move/Hold, so a single "click a node → assign to next open slot" interaction was sufficient. Expanding to the full action set exposes that the interaction model conflates "which node" with "which action," and that some legal actions aren't slot-shaped at all.

**How to avoid:**
- Require an explicit action/op selector (the "Six Operations" from `docs/GAME_DESIGN.md` §5, plus Move/Sprint/Hold) *before* a node-click resolves to a target — never infer Move vs. Strike from click target alone. Node clicks should only fill in the `target`/`to` field of an already-selected action type.
- Add a persistent "free actions" section to the composer, separate from the two numbered slots, that lists whatever `legalOrders(view, agent, prefix)` returns with `type === 'AMBUSH'` (when action-free) or a silencer-purchase control — sourced the same way, from the engine's own answer, not a hardcoded "Ambush costs no slot" assumption baked into a different code path. Confirm `buySilencers` (present on `AgentOrder` per `handlers.ts`'s `SUBMIT_ORDER` handling) has a UI control at all — it's a real wire-protocol field with no client home yet.
- UAT scenario explicitly: a human buys a silencer and lays an ambush in the same round as also using both action slots for Move+Wiretap, and confirms all four effects appear in the resulting order.

**Warning signs:**
- Board-click handler that branches on `if (adjacent) → MOVE else → nothing`, with no explicit selected-action-type state.
- No UI element rendering `legalOrders` results where `slotsLeft <= 0 && freeLeft > 0` (the exact condition `legalOrders.ts` uses to still return Ambush).
- `buySilencers` never referenced anywhere in `apps/web/components/`.

**Phase to address:**
The phase building the full order composer (target feature 1) — this is the direct fix for the milestone's own trigger bug, so it should be the first UAT scenario checked, not an afterthought.

---

### Pitfall 10: Round-clock timing squeeze — 2 agents × 2 actions, replay length competing with the next round's clock

**What goes wrong:**
Two related timing failures:
1. **No pause, tighter clock.** v1.1 explicitly deselects the unanimous-pause flow (Out of Scope) and relies on a host-configurable round timer as the sole mitigation for "2 agents × 2 actions per round" pressure (`CONCERNS.md`'s "No Real-Time Playtest of 4-Action-Per-Round Timing" gap is still open — this has never been human-validated). Without pause as a safety valve, a genuinely difficult 2-agent round (four action choices, Intel-pool math across both) that runs long has no recovery path except auto-Hold, which — for a 2-agent player who only got to submit one agent's order before the clock expired — silently banks the *other* agent's actions as Hold, which may not be what a mid-decision player wanted.
2. **Replay-vs-clock race.** The resolution replay is a "timed, skippable timeline" (target feature 3) that plays *after* the round resolves but *before* (or concurrently with) the next round's Orders phase and its clock starting. If the next round's server-authoritative clock (`deadlineAt`) starts counting down while the client is still mid-replay-animation, players lose real decision time to an animation they can't interact with yet — especially bad for a 4-16-node board where the replay might legitimately need several seconds per beat (`docs/ARCHITECTURE.md` §9: "~700ms per beat 🔧").

**Why it happens:** The clock is server-authoritative and round-boundary-driven (`apps/party/src/timers.ts` sets `deadlineAt` from `roundTimerSeconds`); nothing in the current protocol accounts for "give the client N seconds of grace to finish showing the previous round's story before the next round's countdown is meaningful." This wasn't a problem when there was no animated replay to wait on.

**How to avoid:**
- Decide explicitly whether the next round's clock (`deadlineAt`) starts the instant `resolveRound()` returns, or after a fixed server-side grace window sized to the replay's typical length — and make that a `MatchSettings`/ruleset value the sim/playtest can tune, not a hardcoded client assumption. If the server starts the clock immediately (simplest, most consistent with "the room owns time" — `apps/party/CLAUDE.md` rule 4), the client's replay must be skippable *and* the skip must not cost the player any of the round timer that's already ticking — i.e., skipping should reveal the order composer immediately, with whatever time is left, rather than the replay eating into a fixed budget invisibly.
- Preserve the skip control's discoverability — since replay is "skippable" per the milestone's own feature list, make the default skip-ahead affordance visible from the very first frame, not after a full playthrough.
- This phase should include the deferred playtest telemetry `CONCERNS.md` calls for: log `(submission_time, agents, round_number)` per human submission and specifically compare 1-agent vs. 2-agent players' submission times, now that pause isn't available as a mitigation. If p75 submission time exceeds the default timer with meaningful margin, that's a finding for `MatchSettings.roundTimerSeconds`'s *default*, not just a documentation note.
- For "auto-Hold on partial 2-agent submission" specifically: confirm and test that a player who committed agent A's order but ran out of clock before agent B commits gets *agent B* auto-Held, not both agents, and that this is visually distinguishable in the next round's history/roster from a fully-intentional double-Hold.

**Warning signs:**
- Client code that starts a local replay animation timer independent of anything server-sent, with no coordination to the next `CLOCK` message's `deadlineAt`.
- No telemetry capturing per-human submission timing once the full composer ships — this gap was already flagged in v1.0's CONCERNS.md and would carry forward unaddressed into a milestone that removes the pause safety valve.

**Phase to address:**
The phase building the resolution replay (target feature 3) and the phase confirming host round-timer settings (target feature 6) jointly — the two need to agree on a client/server contract for round-clock-vs-replay timing before either ships independently.

---

### Pitfall 11: New maps (FFA-16, FFA-18) break bot assumptions, churn golden fixtures, and shift balance silently

**What goes wrong:**
`plan.md`'s Phase 1 risk register and `CONCERNS.md`'s "Map Size and Move Generation" section both flag that legal-order enumeration and bot joint-planning cost scale with node count and average degree — current validated scale is 12–18 nodes at ~50–80 legal orders per agent, with joint planning at `O(candidates_A × candidates_B)`. FFA-16/18 are within the documented target range from `docs/GAME_DESIGN.md` §3.1 (16/18 nodes, degree 3.0/3.2), so this shouldn't blow the p99<50ms budget — but it is new content the sim harness has never swept, and the balance-sensitive numbers (`ambushIntelCost`, Strike cost/cooldown, Intel income, blockade frequency) were all tuned and golden-fixture-pinned against Duel-12 and (per `plan.md` Phase 4) whatever the existing suite covers. Two silent failure modes: (a) golden replay fixtures recorded only against `duel-12` never get equivalents for the new maps, so a resolution-pipeline regression on FFA-16/18-specific graph shapes (e.g. a node with unusually high degree, or a longer average path to the extraction point) goes undetected; (b) balance shifts — e.g. ambush spam ceiling, contested-node frequency, dossier respawn distance — are real on a bigger map but never confirmed because `pnpm sim --matches 300 --profile` is only run against the existing ruleset/map defaults unless explicitly pointed at the new map ids.

**Why it happens:** Adding a map is "just content" per `CLAUDE.md`'s "Content is data, not code" rule — genuinely true for correctness (the engine is map-agnostic by design), but balance and coverage aren't automatically map-agnostic just because the *code* is. A new map is new input to a system whose correctness net (golden fixtures) and balance net (sim sweeps) are both currently anchored to specific existing maps.

**How to avoid:**
- Add at least one golden replay fixture per new map (`UPDATE_GOLDEN=1 pnpm test golden`, reviewing the diff per `CLAUDE.md`'s explicit instruction) exercising a full match on FFA-16 and FFA-18, not just unit tests on the map data shape.
- Run `pnpm sim --matches 300 --profile` explicitly against each new map id before considering the phase done, and compare win-rate/match-length/Strike-hit-rate distributions against the existing Duel-12 baseline — per `docs/GAME_DESIGN.md` §13, "every balance claim in this document is a hypothesis until that harness confirms it," and that hypothesis has never been tested on an 18-node graph.
- Explicitly test bot joint-planning latency (p99) on the largest new map with 4 players × 2 agents (the worst case for the `O(candidates_A × candidates_B)` cost `CONCERNS.md` calls out) before shipping — this is a straightforward addition to `packages/ai/tests/validation.test.ts`'s existing speed gate, parameterized by map.
- Double-check map-specific invariants the engine assumes (e.g. blockades "cannot close an extraction point or a node holding the match's last dossier" — §9) hold structurally for the new graphs, not just by absence of a crash in a short sim run.

**Warning signs:**
- New map files added to `packages/engine/src/content/maps/` with no corresponding new golden fixture.
- `pnpm sim` invocations in CI/dev docs that don't parameterize map id, silently only ever exercising the default.
- Bot decision p99 measured only on the map(s) already in the validation suite.

**Phase to address:**
The phase adding FFA-16/18 (target feature 7). Explicitly gate "done" on: golden fixtures exist for both new maps, a sim sweep (300+ matches) ran against both, and bot speed validation ran against the 18-node/4-player/2-agent worst case.

---

### Pitfall 12: Map-by-player-count selection bugs (host picks a player count the map doesn't support well, or the wrong map gets selected)

**What goes wrong:**
`docs/GAME_DESIGN.md` §2 specifies map selection as "by player count" (Duel-12 for solo/1v1, FFA-16 for 3P, FFA-18 for 4P/2v2), but `MatchSettings` (per `apps/party/src/settings.ts`'s current hardcoded config) has a single `mapId` field with no engine-level cross-check against seat count. If host settings (target feature 6) let a host independently set both agent/seat count *and* pick a map (or if map is auto-selected from seat count but seat count can change *after* map selection, e.g. a player joins/leaves between settings being set and match start), a mismatch is possible: a 4-player match auto-locked to Duel-12 (a 12-node map sized for 1–2 players), or a 2-player match dropped onto FFA-18 with acres of unused, action-diluting map.

**Why it happens:** Map selection and seat count are two separate `MatchSettings` fields with a *design intent* relationship ("by player count") but no enforced *code* relationship yet — `settings.ts`'s current `buildMatchConfig` hardcodes both `agentsPerPlayer: 1` and `mapId: 'duel-12'` independently (D-02/D-03 comments), with no logic tying them together. Adding host-configurable settings without also adding the seat-count→map selection rule (or an explicit host override with a sane default) reproduces this as a live bug rather than a hardcoded (currently harmless) mismatch.

**How to avoid:**
- Encode "map selection follows seat count" as validated server-side logic in the host-settings handler (mirroring the existing pattern of `handleSetSeatCount`'s host-only, seat-verified enforcement) — either auto-select the map from seat count with no independent host map picker, or, if the host can override, validate the override against a documented minimum/maximum player count per map and reject/clamp anything nonsensical (e.g. 4 players on Duel-12).
- Re-validate the map/seat-count relationship at match start (`startMatch`/`createMatch` boundary), not only at settings-set time — a seat count that changes between settings submission and countdown completion (a player joins or is kicked) must not leave a stale, now-mismatched map locked in.
- Add a test enumerating every supported player-count value and asserting `createMatch` either selects/validates a map appropriate to it or explicitly documents that mismatches are allowed by design (if that's the chosen tradeoff).

**Warning signs:**
- A host-settings UI with an independent map dropdown and an independent player-count field with no client- or server-side cross-validation between them.
- `createMatch`/`buildMatchConfig` accepting any `(mapId, seatCount)` pair without a check.

**Phase to address:**
The phase adding host match settings (target feature 6), in coordination with the phase adding the new maps (target feature 7) — these should land as one design decision, not two independently-planned features that happen to interact.

---

### Pitfall 13: Host-settings validation bypass, mid-lobby setting changes after ready-up, and settings the engine/bots don't actually honor yet

**What goes wrong:**
Three related host-settings failure modes:
1. **Client-only validation.** A settings panel that greys out illegal combinations (e.g. dossier count outside 2–4, timer outside the allowed set) but doesn't have the server independently re-validate and reject on `SET_SETTINGS` — mirroring exactly the pattern `handleSubmitLoadout`'s own comment warns about for loadouts ("that gate is UX only, never the enforcement").
2. **Settings changing after ready-up / mid-lobby.** The existing ready-up flow triggers a countdown once ≥50% of filled seats are ready (`recomputeCountdown`), and lobby chat/seat-count changes already have to interact carefully with that countdown (`handleJoin`'s comment: "an extra filled seat can drop an already-counting-down ratio back below 50%"). Host settings (round timer, blockade mode, dossier count, agent count) are a new class of change that can land *after* some players have already readied up under the old settings — e.g. a player commits to "2 agents, no blockades" and readies, then the host flips to "1 agent, mixed blockades" before match start. Nothing currently un-readies players when settings change underneath them, which is a fairness/consent issue distinct from the countdown-ratio bug already handled for seat count.
3. **Settings the engine/bots don't honor.** `MatchSettings` has fields (`pausesPerPlayer`, `teams`) that the current hardcoded `buildMatchConfig` explicitly zeroes out or ignores ("no pause flow this phase," `teams: false` unconditionally) and v1.1 explicitly keeps unanimous pause out of scope. A host-settings UI that *exposes a pause-allowance control* (because it's a real `MatchSettings` field) when the room server still hardcodes `pausesPerPlayer: 0` regardless of what's submitted would let a host configure something with zero effect — a "looks configurable, does nothing" bug. Similarly, verify AI opponents actually read and honor every newly-exposed setting (e.g. does `@berlin/ai`'s bot behavior change correctly under a shorter round timer, or blockade-mode `Announced` vs. `Random`, or does it just always play as if defaults were in effect?).

**Why it happens:** The lobby/settings/ready-up state machine already has several interacting invariants (seat count vs. countdown ratio, loadout vs. match-start re-validation) built up incrementally across Phases 1–3; host settings is new surface that intersects all of them at once, and it's easy to build the happy path (host sets values, match starts with them) without re-deriving the "what if this changes after someone committed to the old value" cases the seat-count and loadout code already had to solve.

**How to avoid:**
- Server-side re-validation of every `SET_SETTINGS` field against the ruleset's legal value sets (the same "defense in depth" pattern `startMatch`'s loadout re-validation comment documents), independent of client-side graying-out.
- Un-ready all seats (or at minimum surface a clear "settings changed, please re-ready" prompt) whenever a host settings change lands after any player has readied up — extend `recomputeCountdown`'s existing "an event changed something relevant, recompute the threshold" pattern to also reset ready state on a settings change, not just recompute the ratio.
- Audit every field in `MatchSettings` (not just the ones target feature 6 explicitly lists) before exposing a host control for it: does `buildMatchConfig`/`createMatch` actually thread it through, does `apps/party`'s round/timer/pause code honor it, and does `packages/ai` behave sensibly under it? Only expose controls for settings with an honored, tested path end to end. `pausesPerPlayer` specifically should either stay hidden (matching the Out-of-Scope decision on unanimous pause) or be explicitly wired if exposed — don't let a real settings field become a placebo control.
- Add an explicit test: submit `SET_SETTINGS` with an out-of-range value (e.g. `dossierCount: 99`) and assert server-side rejection identical in spirit to `handleSetSeatCount`'s `SET_SEAT_COUNT_REJECTED` pattern.

**Warning signs:**
- A settings UI control bound to a `MatchSettings` field that `buildMatchConfig`/`startMatch` doesn't read or that a downstream system (`apps/party/src/timers.ts`, `packages/ai`) doesn't branch on.
- No un-ready/re-confirm step when settings change after players have already clicked Ready.
- Any `SET_SETTINGS` handler that trusts the payload without comparing to a ruleset-derived legal-value set.

**Phase to address:**
The phase implementing host match settings (target feature 6).

---

### Pitfall 14: Declassified-dossier redesign fails WCAG 2.1 AA on manila/paper backgrounds, and loses non-color sector encoding

**What goes wrong:**
The redesign trades a monochrome CRT-phosphor theme (dark background, high-contrast green text — architecturally easy to make accessible) for "manila paper, typewriter type, stamps, redaction bars" — a textured, warm-toned, lower-inherent-contrast aesthetic. WCAG 2.1 §1.4.3 requires ≥4.5:1 contrast for normal text and ≥3:1 for large text, and per accessibility guidance on text-over-imagery, "WCAG does not provide any guidance on how to measure [contrast against textured/gradient backgrounds] ... test the area where contrast is lowest" — meaning a typewriter-style body font (often lighter-weight, sometimes with reduced x-height) rendered directly over a manila paper texture/noise/stamp graphic is exactly the failure mode general accessibility guidance calls out, and it's easy to pass a spot-check (testing against the flattest part of the texture) while failing at the texture's darkest/lightest local variation. Separately, the milestone explicitly keeps "non-color sector encoding" as a requirement (Out of Scope only deselects the *high-contrast theme*, not sector shape/pattern encoding) — a paper-and-stamps redesign that reaches for color-coded ink stamps or colored redaction bars as the *primary* sector signal, without preserving the shape/pattern encoding `docs/ARCHITECTURE.md` §9 already established ("every sector also has a distinct shape and pattern"), regresses accessibility that was previously guaranteed.

**Why it happens:** A visual-redesign phase is scoped and reviewed primarily on look-and-feel ("does it read as declassified paper"), and contrast/pattern-encoding checks are easy to defer to "we'll fix contrast in a pass at the end" — by which point the texture, font, and stamp assets are already baked into many components, making systematic fixes expensive.

**How to avoid:**
- Treat contrast as a build gate for this phase specifically, not a polish pass: check contrast at the texture's *worst* local point (the noisiest part of the manila texture under body text, the faintest stamp ink color against paper), using a semi-transparent solid-color reading panel behind text blocks where the texture would otherwise fail — the standard fix ("a single `rgba(0,0,0,0.3)`-style overlay is the difference between failing WCAG and passing it") applies directly here: put body text on a flat, high-contrast panel *styled to look like paper* (subtle border, drop shadow, corner fold) rather than literally rendering text over a busy paper texture image.
- Re-verify every sector's non-color encoding survives the redesign explicitly: RED/BLUE/GOLD/GREEN must still be distinguishable by shape/pattern/icon alone in the new visual language (e.g. distinct stamp shapes or icon glyphs per sector), not just distinct ink colors on paper — write this into the phase's UI-SPEC as an explicit acceptance check, not an assumption carried over from the old theme.
- Run the design skill's accessibility-review audit (WCAG 2.1 AA) against the new theme's actual rendered components before considering the redesign phase done, not against isolated mockups — texture/filter effects and font substitution often change contrast in the browser differently than in a static design tool.
- Typewriter/monospace body fonts should be checked for legibility at the actual UI sizes used (labels, signals-log entries, Burn Track icons) — decorative typewriter fonts frequently have lower legibility at small sizes than the sans-serif body font they're replacing.

**Warning signs:**
- Body text CSS applying `background-image` (a paper texture) directly behind text with no intermediate solid/semi-opaque reading surface.
- Sector encoding in new components implemented as `border-color` or `fill` alone, with the old shape/pattern SVG markers dropped in favor of "the stamp is red now, that's enough."
- No accessibility-review pass scheduled specifically for this phase.

**Phase to address:**
The phase implementing the declassified-dossier visual redesign (target feature 7/8). Explicitly run a WCAG 2.1 AA contrast and non-color-encoding check as a phase-gate, not a nice-to-have.

Sources: [WebAIM: Contrast and Color Accessibility](https://webaim.org/articles/contrast/), [Understanding Success Criterion 1.4.3](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html), [Text over images: The impact on accessibility](https://www.wcag.com/blog/content-over-images-how-does-this-ux-ui-trend-impact-accessibility/)

---

### Pitfall 15: Visual redesign breaks Playwright E2E selectors and static-source hex-color tests

**What goes wrong:**
The existing E2E suite (`apps/web/e2e/*.spec.ts`) and static-source tests (`apps/web/lib/burnTrackPanel.test.ts`, `result.test.ts`, `format.test.ts`, `roundHistoryPanel.test.ts`, `motionPass.test.ts`) already grep for specific hex color values and text/role selectors (`match.spec.ts`'s own asserted colors like `#2563eb`/`#dc2626` for order-locked/rejection text appear directly in `OrderComposer.tsx`). A full theme swap to declassified-dossier styling will change every one of these hardcoded hex values, plus potentially component structure (new stamp/redaction-bar elements, renamed CSS classes) that Playwright role/text selectors depend on. Running the redesign without updating these tests either produces a wall of red CI (annoying but safe) or — worse — someone "fixes" the failures by loosening assertions (e.g. removing the color check entirely) rather than updating them to the new theme's actual values, silently eroding the regression net these tests exist for.

**Why it happens:** Hex-coded test assertions are a natural artifact of "verify the exact intended visual state" testing, but they couple tests tightly to a specific theme's literal values. A redesign phase that doesn't inventory every such test up front treats them as incidental breakage to clear at the end, rather than as an explicit checklist of "theme constants this phase must consciously update."

**How to avoid:**
- Before starting the redesign, grep the full test suite (`apps/web/e2e/`, `apps/web/lib/*.test.*`) for hardcoded hex values and Playwright selectors tied to the old CRT theme, and produce an explicit list of every assertion that must be updated (not just discovered by CI failure).
- Where feasible, migrate hardcoded hex assertions in tests to reference the same design-token source the components use (Tailwind v4 CSS variables per `docs/ARCHITECTURE.md`'s "theme is a token swap" framing) rather than duplicating literal hex strings in tests — this makes the *next* theme swap immune to the same churn.
- Update, don't delete: every color/selector assertion that fails post-redesign should be re-pointed at the new theme's actual value, verified against the real rendered page, not commented out or loosened to a substring/existence check.
- Re-run the full Playwright suite against the redesigned theme as a phase-gate before merging, not as a follow-up cleanup task.

**Warning signs:**
- A PR that "fixes" CI by deleting or loosening a color/selector assertion rather than updating its expected value.
- New components styled with literal hex values inline rather than the existing Tailwind v4 token variables, making the next redesign repeat this same churn.

**Phase to address:**
The phase implementing the visual redesign (target feature 7/8) — inventory and update affected tests as an explicit task within that phase, not a follow-up.

---

### Pitfall 16: "Burn Track" (card-use history) vs. "burned" (agent killed) naming collision confuses players

**What goes wrong:**
This is a named, acknowledged issue at milestone start (PROJECT.md Context: "The 'Burn Track' name (card-use history) also collides with 'burned' (agent killed)"). Concretely: a roster/status UI that now needs to show *both* concepts side by side for the first time (v1.0 built the Burn Track panel in isolation; v1.1 adds the alive/burned roster in the same screens) creates real adjacency — "Player 2's Burn Track shows 3 Strike uses" next to "Player 2: 1 agent burned" reads, to a first-time player, like the same fact stated twice, or like a causal claim ("their Burn Track caused their agent to be burned") that isn't what either term means. `docs/GAME_DESIGN.md` §6.3 is explicit that Burn Track is a "capability profile" (what cards you've used), entirely distinct from an agent's alive/dead status — but nothing in the UI copy or layout currently has to disambiguate them, because they've never shared a screen with a *live* roster before.

**Why it happens:** Both terms are already locked into the design doc and existing code (`BurnEntry`, `burnTracks`, `AGENT_BURNED`) — renaming either at the type/protocol level this late is exactly the kind of "no rule or balance changes in v1.1" scope creep the milestone explicitly excludes (renaming isn't a rule change, but it touches wire protocol, tests, and docs broadly for a naming issue alone). The realistic fix is UI-copy and layout disambiguation, not a rename — but that's easy to skip because nothing *breaks* if the words collide, it just confuses players, which has no automated test to catch it.

**How to avoid:**
- Never let "burned" (agent-killed) and "Burn Track" (card-use log) appear as bare, unqualified words in the same UI region without an explicit qualifier — e.g. label the roster's death state "Agents burned: 1/2" but the card-use panel "Burn Track (card use history)" with a persistent subtitle, every time it's rendered, not just on first appearance.
- Consider a UI-only rename for player-facing copy (keep the internal type/field names `BurnEntry`/`burnTracks` untouched to avoid protocol churn) — e.g. display the Burn Track panel as "Known Capabilities" or "Tradecraft Log" in the redesigned UI, reserving the word "burned" exclusively for agent death everywhere in copy. This is a `docs/GAME_DESIGN.md`-first change per `docs/CLAUDE.md`'s rule ("design changes land here first, then in code") if the canonical rules-doc term also changes — confirm with the user whether a display-name-only change (code/protocol unchanged, UI copy renamed) is acceptable before deciding this, since it still touches the design doc's own vocabulary.
- Add this exact ambiguity as a UAT scenario: show a first-time tester the roster + Burn Track together and confirm they can correctly state, without prompting, which is which.

**Warning signs:**
- UI copy using "burned" and "Burn Track" adjacently with no qualifying subtitle or tooltip.
- A support/playtest note along the lines of "I thought their Burn Track meant their agent died."

**Phase to address:**
The phase building the alive/burned roster (target feature 2), since that's the point at which the two concepts first share screen space at this level of prominence. Flag for a naming/copy decision with the user before implementation, since it may touch `docs/GAME_DESIGN.md`.

---

### Pitfall 17: Vercel monorepo deployment — pnpm workspace package resolution, Node version, and env/host misconfiguration

**What goes wrong:**
This is v1.1's most consequential "looks done but isn't" area because it never happened at all in v1.0 (`apps/web` has never been deployed to Vercel in this environment — RETROSPECTIVE.md's top lesson). Concrete, well-documented failure modes for exactly this stack (pnpm workspace + Next.js + internal TypeScript packages, per external research corroborating the general pattern):
1. **Internal package resolution.** Vercel's default build runs `pnpm install`/build scoped to the app directory rather than the monorepo root unless the project's Root Directory and installCommand/buildCommand are configured for the workspace — `@berlin/shared`/`@berlin/engine`/`@berlin/ai` as workspace-linked TypeScript packages (not published to a registry) can fail to resolve or fail to be included in the deployed build output if the Vercel project isn't explicitly told this is a monorepo (Vercel's own monorepo docs / Turborepo remote-build-graph support exist specifically for this).
2. **Node version mismatch.** Community reports found Node 22 required for pnpm-monorepo TypeScript builds where Node 20 failed with vague errors — worth pinning explicitly in Vercel project settings rather than trusting whatever default the project starts with, especially since the project's own stated baseline is "Node.js 22+."
3. **Build-time `NEXT_PUBLIC_PARTYKIT_HOST`.** This is the *only* environment coupling between `apps/web` and `apps/party` per `docs/ARCHITECTURE.md` §8, but `NEXT_PUBLIC_*` variables are inlined at *build* time, not read at runtime — a value set in the Vercel dashboard after a build already ran won't retroactively apply; every environment (Production, Preview, and any Development/branch deploys) needs the variable explicitly set for the correct target host before its respective build runs.
4. **Preview deployments pointing at production PartyKit.** Per `docs/ARCHITECTURE.md` §8, "preview environments point at a staging PartyKit host so PR previews are fully playable" — but there is currently only one live PartyKit deployment (`berlin1988-party.maxmayermader.partykit.dev`, production). Unless a second (staging) PartyKit deployment is stood up with its own `NEXT_PUBLIC_PARTYKIT_HOST` value scoped to Vercel's Preview environment, every preview deploy will either point at production (real players' live matches sharing infrastructure with untested preview code) or fail to connect entirely (if a staging value is set but no staging PartyKit exists to answer it).
5. **wss:// vs ws:// and CORS/origin checks.** A production Vercel deployment serves over HTTPS, so its WebSocket client must connect via `wss://`, not `ws://` — confirm `partysocket` client configuration derives the correct scheme from the environment rather than a hardcoded `ws://` left over from local development, and confirm the PartyKit room's own CORS/origin allowlist (if any) includes the deployed Vercel domain(s), including preview-deployment subdomains if those are expected to work.
6. **CLI/auth availability for an automated agent.** This is the literal root cause RETROSPECTIVE.md names for why this never happened in v1.0: "no `vercel` CLI / linked project available to the executing agent." If v1.1's execution again runs through an autonomous agent without interactive Vercel CLI login or an already-linked project, the same gap will recur silently unless it's treated as a blocking, human-verified checkpoint rather than a task an agent can complete unsupervised.

**Why it happens:** All six are specific to "first deploy of a pnpm-workspace monorepo with internal, unpublished TypeScript packages, alongside a *second*, independently-hosted realtime backend" — a genuinely uncommon combination that generic single-app Next.js deployment guidance doesn't cover, and that this project has simply never exercised end to end.

**How to avoid:**
- Treat first deployment as its own explicit task with a human-verified checkpoint, per RETROSPECTIVE.md's own top lesson ("verify the deployment actually exists *before* the phase that depends on it closes"). Don't let it ride silently across sub-tasks the way it did across three phases in v1.0.
- Configure the Vercel project's Root Directory / build settings for the monorepo explicitly (per Vercel's monorepo documentation), and verify a clean build succeeds from a fresh clone locally with the same commands Vercel will run, before relying on Vercel's own build logs to discover a resolution failure.
- Pin the Node version in Vercel project settings to match the project's stated Node 22+ baseline explicitly, rather than trusting a platform default.
- Set `NEXT_PUBLIC_PARTYKIT_HOST` per Vercel environment (Production and Preview, at minimum) *before* triggering the builds that need it, and confirm via the deployed bundle (not just the dashboard) which value actually got inlined.
- Decide explicitly whether v1.1 stands up a second (staging/preview) PartyKit deployment, or accepts that Preview deployments point at production `apps/party` for this milestone (a real product/ops decision, not just a config detail) — document whichever is chosen in `docs/ARCHITECTURE.md` §8 rather than leaving the "staging host" line aspirational and unrealized.
- Confirm the CLI/auth question up front: does the executing agent (human or automated) have `vercel` CLI access and a linked project for this repository? If not, flag this as a blocking human-only step at the start of the deployment phase, not discovered as "yet another gap" at the end.

**Warning signs:**
- A Vercel build succeeding locally with `pnpm build` from the repo root but failing on Vercel with a module-resolution error for `@berlin/shared`/`@berlin/engine`/`@berlin/ai`.
- A deployed preview or production site connecting to the wrong PartyKit host (or failing to connect at all) despite `NEXT_PUBLIC_PARTYKIT_HOST` appearing correct in the Vercel dashboard.
- The phase's task list containing "deploy to Vercel" as a single unverified checkbox rather than an explicit human-in-the-loop checkpoint with a live URL confirmed reachable.

**Phase to address:**
The phase performing the Vercel deployment (target feature 8) — should be sequenced early enough in the milestone that any of the above surfaces with time to fix them before the milestone's "done looks like" (playing a live match with friends on the deployed site) is attempted.

Sources: [Vercel: Using Monorepos](https://vercel.com/docs/monorepos), [Next.js in a Monorepo: Resolving internal packages](https://community.vercel.com/t/next-js-in-a-monorepo-resolving-internal-packages/579), [Vercel "No Next.js version detected" for Next 15 app in pnpm monorepo](https://community.vercel.com/t/vercel-no-next-js-version-detected-for-next-15-app-in-pnpm-monorepo/18750)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Rendering opponent roster from a client-side running tally instead of `OpponentPublicInfo` fields alone | Richer-feeling roster sooner | Reopens fog leaks by inference (Pitfall 2) | Never |
| Static cost/cooldown lookup table for the order composer instead of `legalOrders()`-derived values | Faster to build, simpler component | Silent drift from engine truth the moment sequencing/affinity matters (Pitfall 6) | Never — even a v1.1-scoped "quick preview" must derive from `legalOrders` |
| Skipping a staging PartyKit deployment and pointing Preview at production | One less thing to stand up this milestone | Preview-deploy testing shares infrastructure with real live matches; a bad preview build can affect production room state indirectly (e.g. protocol mismatches) | Acceptable only as an explicit, documented decision for v1.1's scope — not a silent default |
| Un-readying no one when host settings change mid-lobby | Simpler settings-change handling | Players commit to settings that silently change under them (Pitfall 13) | Acceptable only if the UI makes the change loudly visible and blocks match start until every seat re-confirms |
| Literal manila-texture image behind body text instead of a flat reading panel styled to look like paper | Closer to the intended "real paper" look | WCAG contrast failures at the texture's noisiest points (Pitfall 14) | Never for body text; acceptable for large decorative headers only if independently contrast-checked |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| PartyKit ↔ Vercel (`NEXT_PUBLIC_PARTYKIT_HOST`) | Assuming a dashboard-set env var applies retroactively to an already-built deployment | Set per-environment before the build that needs it; verify against the actual deployed bundle |
| `apps/web` predictive engine calls ↔ room's authoritative `submitOrder` | Trusting the client-side `legalOrders` preview as the final word, skipping server-rejection UX | Always render an explicit reconciliation path for `ORDER_REJECTED`, especially for the cross-agent Intel case (Pitfall 7) which the client preview can plausibly miss |
| Playwright E2E ↔ visual redesign | Loosening hardcoded hex/selector assertions to "make CI green" instead of updating them | Inventory every hex/selector-dependent test before the redesign starts; update to new theme values, never delete the check |
| Host settings ↔ map content | Independent host controls for seat count and map with no cross-validation | Auto-select or validate map against seat count server-side (Pitfall 12) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Bot joint-planning cost on larger maps | p99 decision latency creeps up on FFA-16/18 with 4 players × 2 agents | Add map-parameterized speed tests to the existing validation suite before shipping new maps | Documented risk at "if maps grow significantly" per CONCERNS.md; FFA-18 is the first real test of this |
| Replay animation blocking the next round's clock | Players report losing real decision time to an unskippable-feeling replay | Server/client contract for clock start vs. replay length (Pitfall 10); make skip instant and lossless | As soon as replay length approaches a meaningful fraction of the round timer, especially at 30s settings |
| Manila-texture SVG filters/patterns on every node/board render | Frame drops or jank on the board, especially with resolution replay animating concurrently | Prefer simple gradients/flat panels with light texture overlays over per-node filter effects; profile the board specifically with the new theme applied during replay animation | Larger maps (16–18 nodes) with textured node/edge rendering plus concurrent replay animation is the worst case to profile |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Replay/roster/spectator UI reconstructing opponent state from anything other than the projected `PlayerView`/`ResolutionEvent[]` it was given | Reopens the exact fog-of-war leak class the engine's type system exists to prevent (Pitfalls 1–3) | Every new presentation surface's only allowed inputs are `PlayerView` fields and the round's own filtered event array; add a leak-scan-style test per new surface |
| Host-settings/lobby broadcast growing to include per-seat loadout or other match-secret data | Leaks a player's deckbuilding strategy to opponents before the match starts | Treat every new field on a room-wide broadcast payload as a security change (Pitfall 4), same review bar as `PlayerView` |
| Client-side re-filtering of `history` against current `PlayerView` state | Reintroduces the exact bug Phase 4's research found and fixed for round history (Pitfall 5) | New history-consuming features must not accept both a past round's events and the live view as separate inputs to be cross-referenced |
| Host-settings validation trusted from the client without server-side re-check | A modified or buggy client submits illegal settings (e.g. absurd dossier counts) that the server accepts | Server-side validation against the ruleset's legal-value sets on every `SET_SETTINGS`, mirroring `handleSetSeatCount`'s existing pattern (Pitfall 13) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Node-click ambiguity between Move and Strike | Strike stays undiscoverable (the milestone's own trigger bug) | Explicit action-type selector before node-click resolves to a target (Pitfall 9) |
| No visible home for zero-action Ambush/silencer purchases | Players never learn these exist even though the engine supports them | A persistent "free actions" section fed directly from `legalOrders`'s free-action results (Pitfall 9) |
| "Burn Track" and "burned" appearing unqualified on the same screen | New players misread card-use history as death, or vice versa | Persistent disambiguating labels/subtitles every time both concepts share a view (Pitfall 16) |
| Replay animation with no clear relationship to the next round's clock | Players feel cheated out of decision time by an animation, especially under the removed-pause constraint | Explicit, tested clock/replay timing contract, instant lossless skip (Pitfall 10) |
| Spectator mode that feels like "the game keeps playing without you" with no framing | Eliminated players disengage entirely rather than staying to watch | Frame spectator mode explicitly as "your fog, frozen at elimination" with UI copy explaining why some information stopped updating |

## "Looks Done But Isn't" Checklist

- [ ] **Order composer:** Often missing the "free actions" section (Ambush when action-free, silencer purchases) even when Move/Sprint/card slots all work — verify `legalOrders(view, agent, prefix)` results with `type === 'AMBUSH'` at `slotsLeft <= 0` actually render somewhere, and that `buySilencers` has a UI control.
- [ ] **Two-agent Intel pool:** Often missing correct cross-agent Intel accounting in the *preview* (server-side `submitOrder` will catch the actual overspend, but the client preview showing both agents as independently affordable is a UX bug even when correctness holds) — verify by drafting agent A to near-zero Intel and checking agent B's preview reflects it before submission.
- [ ] **Resolution replay:** Often missing an explicit boundary against `GameState`-shaped data — verify by code review that the component's props/imports never include anything beyond `PlayerView`/`ResolutionEvent[]`, and by running a leak-scan-style test with an opponent doing something the viewer isn't entitled to see.
- [ ] **Spectator view:** Often missing a decision on frozen-vs-continuing fog after elimination — verify there's an explicit engine-level answer (not an ad hoc client filter) and a test exercising it.
- [ ] **Host settings:** Often missing server-side re-validation, un-ready-on-change, and map/seat-count cross-validation, even when the client-side form looks complete — verify each with a dedicated test, not just the happy-path settings flow.
- [ ] **New maps:** Often missing golden fixtures and a sim sweep — verify `UPDATE_GOLDEN=1 pnpm test golden` produces reviewed fixtures for both new maps and `pnpm sim --matches 300 --profile` has been run against each.
- [ ] **Visual redesign:** Often missing a WCAG 2.1 AA contrast pass on the actual rendered (not mocked) components, and often missing preserved non-color sector encoding — verify both explicitly, and verify the full Playwright/static-source test suite was updated (not loosened) for the new theme.
- [ ] **Vercel deployment:** Often "looks done" as a completed checkbox with no live URL actually confirmed reachable and playable by someone other than the deploying agent — verify with a human opening the deployed URL and playing at least one full round against a live PartyKit-hosted match.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Fog leak found post-ship in replay/roster/spectator UI | MEDIUM | Same discipline as the Phase 1 stable-agent-id bug: identify the exact leaking field/inference, patch `filterEvents`/`projectView`/the presentation layer, add a regression test reproducing the exact leak scenario, and confirm no in-flight match's client cached the leaked data client-side beyond the current session |
| Cross-agent Intel double-spend surfaced by confusing `ORDER_REJECTED`s in production | LOW | Server-side correctness already holds (submitOrder is the backstop); fix is purely the client preview calculation — low risk, no data corruption, just a UX patch |
| Golden fixtures/balance found broken on new maps after ship | MEDIUM | Regenerate fixtures with `UPDATE_GOLDEN=1 pnpm test golden` and review the diff carefully (per `CLAUDE.md`'s explicit instruction) rather than accepting the regeneration blindly; re-run `pnpm sim` before re-releasing |
| WCAG contrast failures found post-ship on the new theme | LOW-MEDIUM | Token-level fix (adjust CSS variable values) if the design uses Tailwind v4 tokens consistently; higher cost if hex values were hardcoded per-component |
| Vercel deployment misconfigured (wrong PartyKit host, stale env) | LOW | Re-set the environment variable for the correct scope and trigger a fresh build — no data risk since this is client-bundle configuration, not stored state |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Replay animates un-received opponent movement | Resolution replay phase | Fog-leak-style test on rendered replay output, per-viewer, across a round with opponent activity |
| 2. Roster/signals reveal death by inference | Alive/burned roster phase | UAT: two-agent opponent, one dies, tester cannot identify which via any earlier-observed trait |
| 3. Spectator view reveals full state | Spectator view phase | Engine-level fog test for post-elimination `projectView`/spectator semantics |
| 4. Host-settings snapshot leaks loadouts | Host match settings phase | Protocol test asserting `ROOM_STATE`/settings broadcast never includes another seat's loadout |
| 5. Client-side re-filtering of history | Replay/signals/roster phases (any touching `history`) | Regression test: move viewer's agent adjacent to an old event in a later round, assert frozen grading |
| 6. UI re-implements Intel/cooldown math | Order composer phase | Test asserting composer's displayed costs/cooldowns match `legalOrders()`'s own output |
| 7. Cross-agent Intel double-spend | Order composer phase (2-agent path) | Integration test: draft agent A near-zero, verify agent B's preview reflects reduced pool before submission |
| 8. Movement-first ordering breaks composer | Order composer phase | Test: slot reorder clears and re-legalizes rather than swapping cached `Action` objects |
| 9. Strike/Move ambiguity, hidden zero-action purchases | Order composer phase | UAT: human buys silencer + lays ambush + uses both slots in one round, all four effects present |
| 10. Round-clock vs. replay timing | Resolution replay + host settings phases | Explicit server/client clock-vs-replay contract test; submission-time telemetry captured and reviewed |
| 11. New maps break bot/balance assumptions | New maps phase | Golden fixtures + `pnpm sim --matches 300 --profile` per new map; bot speed validation at 4p/2-agent worst case |
| 12. Map-by-player-count selection bugs | Host settings + new maps phases (joint) | Test enumerating player counts, asserting map selection/validation logic |
| 13. Host-settings validation/consent bypass | Host match settings phase | Server-rejects out-of-range `SET_SETTINGS`; un-ready-on-change test; audit every exposed field is actually honored end to end |
| 14. Redesign fails WCAG AA / loses sector encoding | Visual redesign phase | WCAG 2.1 AA contrast audit on rendered components; explicit non-color sector encoding check |
| 15. Redesign breaks E2E/static-source tests | Visual redesign phase | Full Playwright + static-source suite updated (not loosened) and green against new theme |
| 16. "Burn Track" vs. "burned" naming collision | Alive/burned roster phase | UAT: first-time tester correctly distinguishes the two concepts unprompted |
| 17. Vercel monorepo deployment gotchas | Vercel deployment phase | Human confirms a live, reachable URL; a full round played against the live PartyKit host from the deployed site |

## Sources

- `docs/GAME_DESIGN.md` §4, §5, §6.3, §7.2, §8.1, §10 (movement-first ordering, Burn Track semantics, spectator rule, signals)
- `docs/ARCHITECTURE.md` §4.1, §5, §8, §9 (fog boundary, protocol, deployment, accessibility)
- `packages/shared/src/view.ts`, `packages/engine/src/fog/filterEvents.ts`, `packages/engine/src/legalOrders.ts` (read directly for this research)
- `apps/party/src/handlers.ts`, `apps/party/src/settings.ts` (read directly — confirms hardcoded settings and existing host-only/re-validation patterns)
- `apps/web/components/orders/OrderComposer.tsx` (read directly — confirms current legalOrders-driven discipline and its Phase 1 scope limits)
- `.planning/codebase/CONCERNS.md` (2026-08-18 audit — timing, map-scaling, and asymmetric-loadout gaps)
- `.planning/RETROSPECTIVE.md` (v1.0 lessons — deploy-checkpoint discipline, fog-of-war regression pattern)
- `.planning/PROJECT.md` (v1.1 trigger playtest findings, Burn Track naming collision, deploy gap)
- [Vercel: Using Monorepos](https://vercel.com/docs/monorepos)
- [Next.js in a Monorepo: Resolving internal packages — Vercel Community](https://community.vercel.com/t/next-js-in-a-monorepo-resolving-internal-packages/579)
- [Vercel "No Next.js version detected" for Next 15 app in pnpm monorepo — Vercel Community](https://community.vercel.com/t/vercel-no-next-js-version-detected-for-next-15-app-in-pnpm-monorepo/18750)
- [WebAIM: Contrast and Color Accessibility](https://webaim.org/articles/contrast/)
- [Understanding Success Criterion 1.4.3 — W3C](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html)
- [Text over images: The impact on accessibility — WCAG.com](https://www.wcag.com/blog/content-over-images-how-does-this-ux-ui-trend-impact-accessibility/)

---
*Pitfalls research for: Berlin 1988 v1.1 — Gameplay and UI Refinement*
*Researched: 2026-09-14*
