# Milestones

## v1.0 MVP (Shipped: 2026-09-14)

**Phases completed:** 4 phases, 18 plans, 50 tasks

**Key accomplishments:**

- Create-a-game-by-code and join-by-code working end to end through a real PartyKit room and a real Next.js app — Zod wire protocol, deterministic join codes, localStorage identity, and a pure client reducer, all proven by a passing two-browser Playwright test.
- Server-authoritative ready-up lobby with a recompute-on-every-event >=50% countdown, AI auto-fill at match start via a seeded-RNG HANDLER-tier bot draw, and the single `startMatch`/`createMatch` transition that assigns every seat the PHANTOM loadout and fans out per-connection `PlayerView`s through a grep-gated `projectView` chokepoint.
- The full order->seal->resolve->project round loop is live in the PartyKit room: SUBMIT_ORDER validated and held secret through the engine's own submitOrder(), a server-authoritative 90-second absolute-timestamp deadline with auto-Hold, and AI bot seats that decide from projectView() and submit through the identical path as humans — proven wire-safe by a 19-case fog scan over three room ids and six rounds each.
- The Berlin board renders entirely from `PlayerView.map` with fog as absence, and a player composes a two-action order from `legalOrders()`'s own answers — proven by click, by keyboard, and by a server rejection, all landing a real ack through Plan 01-03's pipeline.
- "N of M submitted" plus a server-derived countdown while composing, and a click-to-advance resolution report that replays the engine's own eleven-step log one row at a time, per-row motion gated on prefers-reduced-motion.
- Result screen renders MatchOutcome verbatim (no client-side victory logic), apps/party is deployed and verified live on Cloudflare, and the four-player timing measurement is recorded — Task 3's phase-gate checkpoint remains open pending a Vercel deployment of apps/web that does not yet exist in this environment.
- The whole `SUBMIT_LOADOUT` pipe — a documented-but-never-implemented wire message from `docs/ARCHITECTURE.md` §5 — now runs end to end: a preset picked on `/deck` persists via a Zustand store mirroring `identity.ts`, reaches the room through a new Zod-validated message, and is what `startMatch` deals that seat instead of the Phase 1 `PHANTOM` hardcode.
- The tracer's preset-only shell became a real deckbuilder: all 34 cards browsable in seven canonically-ordered sections, a per-card Add/Remove toggle that never refuses, and a persistent legality meter — card count, BP bar, six icon pips, four-color checklist, and named violations — that is provably `validateLoadout()`'s own answer on every render, with the specific over-limit tile marking itself.
- Grew `apps/party/tests/loadout.test.ts` from Plan 02-01's 3-case happy path into a 21-case adversarial contract covering cross-seat isolation, all five engine violation codes, every room-phase guard, and a literal wire-frame fog scan — with zero production code changes, because Plan 02-01's `handleSubmitLoadout`/`setLoadout`/`startMatch` already satisfied every case.
- The lobby now embeds the exact same Deckbuilder component the home page uses: opening it clears ready through the existing broadcast (D-05), Save Loadout is gated on live legality and reconciled only by the room's own reply, an always-enabled Back to Lobby exit never loses the local draft, and an "unsaved changes" notice names which deck a match will actually use whenever the two copies disagree — closing DECK-05 and every requirement in Phase 2.
- A second PartyKit party (`directory`) holding a live, code-keyed registry of open lobbies, streamed to the home page over its own WebSocket, with one-click join reusing the existing JOIN handshake unchanged.
- Host-only `SET_SEAT_COUNT` and `KICK` wire messages with server-side authority checks, a Kick button visible only to the host, and the kicked player's own redirect-and-banner experience with an open door back via the join code.
- Lobby and in-match chat over a `CHAT_SEND`/`CHAT_MESSAGE` wire pair, with server-resolved codename attribution, two phase-scoped bounded logs, and a curated 10-line flavor-prompt picker shared by both surfaces.
- `controlledBy` splits seat origin from current driver; a 20s disconnect grace period folds into the room's single alarm slot; a reconnect purges any stale bot order before it can overwrite a fresh human submission — verified end to end across real browser sessions.
- Server-side per-player round history (`GameState.history`/`PlayerView.history`), filtered exactly once at resolution time, delivered through the existing `projectView()`/wire protocol, and rendered as a bottom-left Intel drawer — plus `apps/web/lib/motion.ts`, the app's one shared reduced-motion utility.
- Round-history rows now say what happened (`Round {N} — {headline}`) instead of showing a bare round number, and clicking a row re-runs that round's full resolution through the existing `StepThrough` renderer — no second event-log renderer, and the live resolution's reveal cursor is never disturbed.
- a pure, node-testable formatting module exporting:
- Every route now fades in on mount, both Button variants darken on hover, StepThrough runs on the shared motion utility instead of its own inline branch, and MatchChat/CardGrid/MatchIntelDrawer are folded into the same one reduced-motion code path — verified end to end by the user with the OS reduced-motion preference both off and on.

---
