# Walking Skeleton — Berlin 1988

**Phase:** 1 (Playable Skeleton)
**Generated:** 2026-08-19

## Capability Proven End-to-End

> A player opens the home page, clicks **Create Game**, receives a join code minted by a live PartyKit room, and a second browser entering that code lands in the same room and sees both seats — with every byte on the wire produced by `projectView()`.

That single round-trip exercises: Next.js App Router → `partysocket` WebSocket → PartyKit Durable Object → Zod-validated inbound message → authoritative `RoomState` read/write → per-connection outbound projection → React render. Every later slice in Phase 1 (ready-up, board, orders, resolution, result) extends that spine without changing it.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Realtime host | **PartyKit 0.0.115** (Cloudflare Durable Objects), one room per match | D-08 resolved by `01-RESEARCH.md`. Vercel's native WebSocket support (public beta 2026-06-22) has no fan-out to multiple subscribers and caps connection duration at 5 min (30 min extended beta, Pro/Enterprise only) — a 14-round match at the locked 90 s timer exceeds that on order-phase time alone, forcing a mid-match reconnect that D-11 explicitly declined to build. Rated **one-way** in CONTEXT.md; already decided, so recorded here rather than re-gated. |
| Web framework | **Next.js 15 App Router + React 19**, deployed to Vercel | Already locked in `docs/ARCHITECTURE.md` §2. Do not upgrade to Next.js 16 mid-milestone. |
| Room ↔ match topology | **One phase-gated room**, `RoomState.phase: 'LOBBY' \| 'LOADOUT' \| 'IN_GAME' \| 'ENDED'` | RESEARCH.md Open Question 1 — the 4-phase shape is kept (not collapsed to 3) so Phase 2's deckbuilder can fill `LOADOUT` without a mid-milestone state-machine change. Distinct from the engine's `MatchPhase` (`LOBBY\|LOADOUT\|ORDERS\|RESOLVED\|FINISHED`), which only exists once `GameState` exists. No separate lobby-directory room — the public browser is Phase 3. |
| Wire protocol | **Zod schemas in `packages/shared/src/protocol.ts`**, TS types via `z.infer` | `packages/shared/src/CLAUDE.md` lists `protocol.ts` as an expected file that does not exist yet; this phase creates it. Zod is `shared`'s one sanctioned runtime dependency (`packages/CLAUDE.md`). Both apps import the same schemas, so there is no second wire definition. |
| Data layer | **No database.** `RoomState` lives in the Durable Object and is persisted to PartyKit storage after every mutation | No accounts in v1. The join code *is* the room id. Postgres is Phase 6 per `apps/party/src/CLAUDE.md`. Storage persistence is what makes the room hibernation-safe (Pitfall 3). |
| Identity / auth | **No login.** Room-minted opaque player token bound to a connection at `JOIN`; codename auto-generated client-side and persisted to `localStorage` | D-09. `playerId` is read from the connection↔seat binding in `auth.ts`, never from a message body (`apps/party/src/CLAUDE.md` rule 2). |
| Fog boundary | **`broadcast.ts` is the sole outbound path**, calling `projectView(state, playerId)` once per connection | `apps/party/src/CLAUDE.md` rule 1. Room-wide fan-out is reserved for genuinely public lobby data (seat/ready flags, `deadlineAt`, commit counts). Enforced by `apps/party/tests/fog-wire.test.ts`, not by review. |
| Directory layout | `apps/party/src/*` flat (`room.ts`, `handlers.ts`, `broadcast.ts`, `bots.ts`, `timers.ts`, `settings.ts`, `auth.ts`) — per `apps/party/src/CLAUDE.md`, **not** RESEARCH.md's nested `match/handlers/*` proposal. `apps/web` per `apps/web/*/CLAUDE.md` (`app/`, `components/{board,orders,hud,lobby,resolution,result,ui}/`, `lib/`) | The checked-in per-folder CLAUDE.md files are the repo's own convention and outrank a research-time proposal. Divergence is deliberate and recorded here. |
| Deployment target | `apps/web` → Vercel. `apps/party` → Cloudflare via `partykit deploy`. **Phase 1 ships a documented local full-stack run command** (`pnpm dev`), with one deployed idle-then-message check at the phase's human-verify gate | Durable Object hibernation never triggers in local dev (ROADMAP.md research flag), so the hibernation-safety pattern must be confirmed against a deployed room once. |
| Styling | Tailwind CSS v4, `@theme` CSS variables, hand-authored primitives in `components/ui/` | D-10 "clean but plain". No shadcn this phase (`01-UI-SPEC.md` Design System). The token set is the seam a later CRT theme swaps. |
| Client state | Zustand — `matchStore` holds one `PlayerView`, `uiStore` holds selection/pending slots/reveal index | `apps/web/lib/CLAUDE.md` rule 2: no client-side `GameState` mirror. |

## Stack Touched in Phase 1

- [ ] **Project scaffold** — `apps/web` (Next.js 15, Tailwind v4) + `apps/party` (PartyKit) package.json/tsconfig/build, root `pnpm dev` running both, `vitest.config.ts` extended to `apps/**`, Playwright installed for two-browser E2E *(Plan 01-01)*
- [ ] **Routing** — `/`, `/lobby/[code]`, `/match/[code]` *(Plans 01-01, 01-04)*
- [ ] **Real read AND write against authoritative room state** — `CREATE` mints a join code and writes `RoomState` to Durable Object storage; `JOIN` reads it back and returns a per-connection snapshot *(Plan 01-01)*
- [ ] **UI wired to the server** — Create Game button → live join code; join-code entry → same room; ready toggle → every connection re-renders *(Plans 01-01, 01-02)*
- [ ] **Deployment** — documented local full-stack command `pnpm dev`; one deployed PartyKit idle-then-message hibernation check at the Phase 1 verification gate *(Plans 01-01, 01-06)*

## Out of Scope (Deferred to Later Slices)

Explicit, so no later phase re-litigates Phase 1's minimalism:

- **Deckbuilder and per-player loadouts** — every seat is hardcoded to the `PHANTOM` preset (D-01). Phase 2.
- **Public lobby browser** — code-only join, no discovery list (HOME-03). Phase 3.
- **Chat** (CHAT-01/02/03), **host seat-count and kick controls** (LOBBY-01/02), **AI name + personality readout** (LOBBY-07). Phase 3.
- **Reconnection and drop resilience** — a refresh loses the session; the UI states this explicitly rather than hanging (D-11, LOBBY-06). Phase 3.
- **Round history log** (MATCH-06) and **Burn Track panel** (MATCH-07). Phase 4.
- **Transition/animation polish beyond D-06's per-step slide/fade** (POLISH-01) and **full CRT/teletype theming** (THEME-01). Phase 4 / v2.
- **Pause flow** — `REQUEST_PAUSE`/`ANSWER_PAUSE` exist in `docs/ARCHITECTURE.md` §5 but appear in no Phase 1 requirement; `pausesPerPlayer` is set to 0 and the handlers are not built.
- **Order retraction** — `RETRACT_ORDER` exists in `docs/ARCHITECTURE.md` §5 and `01-UI-SPEC.md` reserves copy and the destructive colour for a "Retract order" button, but it appears in no Phase 1 requirement id, exactly like the pause flow above. It is also in direct conflict with MATCH-04's resolved edge that the submitted count "only increases within a round, never decreases until the next round begins" — retracting necessarily decrements it. Resolved in favour of the monotonic count: the handler is not built (Plan 01-03), and the need it served is covered by Plan 01-04's composer, where both action slots are freely editable until the player presses Submit Orders. Reinstating retraction later means revising Plan 01-05's monotonic-count truth in the same change.
- **2-agent play** — `agentsPerPlayer: 1` (D-02, rated *costly*). Components still take agent **lists**, never a singleton, so the 2-agent path stays cheap to switch on.
- **Second map / FFA-16 / FFA-18** — `duel-12` is the only implemented map and ships as-is for all seat counts (D-03).
- **Gameplay rebalancing** — the documented Katja duel dominance (84%) is a known playtest caveat, not a Phase 1 fix (`REQUIREMENTS.md` Out of Scope).

## Deliberate Additions Recorded During Planning

One item is *in* scope that the phase's own context did not anticipate, recorded here so it is not mistaken for drift:

- **`SelfView.score`** (`packages/shared/src/view.ts`, filled by `projectView` from `scoreOf`) — `01-CONTEXT.md` states "no engine changes expected", and this is the single line below `apps/` that Phase 1 adds. `OpponentPublicInfo.score` already exists, so without this field a player is the only participant in a match who cannot see their own standing, and MATCH-08's result screen would have to recompute it — which `01-RESEARCH.md`'s Don't Hand-Roll table forbids, because a second scoring implementation can disagree with the engine about who won. The field is additive, leaks nothing (the same number is already in every opponent's view), is asserted symmetric by `packages/engine/tests/score-symmetry.test.ts`, and leaves `OpponentPublicInfo` untouched. Added in Plan 01-06, rated *reversible*.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering the decisions above:

- **Phase 2 — Deckbuilder & Persistent Loadouts:** fills the already-present `LOADOUT` room phase and replaces the hardcoded `PHANTOM` with a `SUBMIT_LOADOUT` message carrying a player-built deck. No transport or room-topology change.
- **Phase 3 — Open Lobbies, Host Control & Table Talk:** adds a `lobbies` directory room alongside the match room, plus `SET_SEAT`/kick/chat message types and AI takeover on disconnect. First phase to need session resumption, which is why V3 Session Management is deliberately deferred until here.
- **Phase 4 — Deduction Surfaces & Presentation Polish:** pure client work over the `ResolutionEvent[]` and `burnTracks` fields `PlayerView` already carries; adds Motion transitions behind `prefers-reduced-motion`.
