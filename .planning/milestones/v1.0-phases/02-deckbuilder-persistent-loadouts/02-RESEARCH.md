# Phase 2: Deckbuilder & Persistent Loadouts - Research

**Researched:** 2026-08-27
**Domain:** Client-side React/Zustand form-and-validation UI over an existing pure-function rules engine; a wire-protocol gap between an already-documented client→server message and its (currently absent) implementation
**Confidence:** HIGH

## Summary

This phase is almost entirely a UI problem, not a rules problem. `packages/engine` already exports everything needed to compute loadout legality (`validateLoadout`, `budgetPointsOf`, `consumablePassivesIn`), the full card pool (`ACTIVE_CARDS`, `PASSIVE_CARDS`, `ALL_CARDS`), and the four starter presets (`PHANTOM`, `HUNTER`, `OLIGARCH`, `SPIDER`) as reviewed, tested data. Nothing in this phase should reimplement legality math or hand-author card/preset content — the deckbuilder is a live-updating view over functions that already exist and are exported from `@berlin/engine`'s public barrel `src/index.ts`. `apps/web/lib/identity.ts` is a complete, working reference for the exact localStorage-with-no-login persistence pattern this phase needs (hydrate-or-generate on load, `StorageLike` interface for SSR/test safety, JSON parse-or-discard on corruption).

The one piece of real design work this phase surfaces is **how the client's persisted loadout reaches the authoritative room server**, since the room (not the browser) is what calls `createMatch`/`startMatch` and currently hardcodes every seat to `PHANTOM` (`apps/party/src/settings.ts:53-67`). `docs/ARCHITECTURE.md` §5 already specifies a `SUBMIT_LOADOUT` client→server message (`{ cards: CardId[] }`) that Phase 1 never implemented — it exists only as a protocol-table entry and as an aspirational line in `apps/party/src/CLAUDE.md`'s expected-files table. Phase 2 must add this message to `packages/shared/src/protocol.ts`'s `clientMessageSchema`, add a handler in `apps/party/src/handlers.ts`, add a `loadout` field to the server-only `RoomSeat` shape, and stop `startMatch`'s blanket `PHANTOM` overwrite for human seats. `RoomPhase` already contains an unused `'LOADOUT'` value (`apps/party/src/state.ts:19`) reserved for exactly this.

**Primary recommendation:** Build one presentational `<Deckbuilder>` component in `apps/web/components/deck/` (props in, callbacks out, no network/localStorage access itself, per `apps/web/components/CLAUDE.md` — "nothing here fetches"). Back it with a new `apps/web/lib/loadoutStore.ts` Zustand store that owns hydration-from-localStorage (mirroring `identity.ts`'s pattern) and computes live legality by calling the engine's `validateLoadout`/`budgetPointsOf` directly — never reimplementing that logic. Mount the component at a new `/deck` route (already documented as an expected route in `apps/web/app/CLAUDE.md`) for the home-page entry point, and again inside `app/lobby/[code]/page.tsx` behind an open/close toggle for the in-lobby entry point. Wire a new `SUBMIT_LOADOUT` message (matching `docs/ARCHITECTURE.md` §5's existing spec) through `apps/web/lib/socket.ts`'s single network chokepoint so the room's stored per-seat loadout — not a hardcoded `PHANTOM` — is what `startMatch` reads.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Card pool / starter presets (data) | Package (`packages/engine/src/content`) | — | Already reviewed, tested data; nothing to author this phase |
| Loadout legality computation | Package (`packages/engine`) | — | `validateLoadout`/`budgetPointsOf`/`consumablePassivesIn` are pure functions; UI must call them, never reimplement |
| Live legality meter UI | Browser / Client | — | Rendering + interaction only; the numbers it displays come from the engine call above |
| Persisted single loadout (no login) | Browser / Client (localStorage) | API/Backend (room, at match-start) | Source of truth lives in the browser; the room needs a *copy* only to build `MatchSettings`/seed `GameState.players[x].loadout` |
| Loadout reaching the authoritative match | API/Backend (PartyKit room) | Browser / Client (sends it) | Only the room may call `createMatch`/`startMatch`; per `apps/party/CLAUDE.md`, `apps/web` "is a view" and its engine calls are predictive-only |
| Ready-state clear on deckbuilder open (D-05) | API/Backend (room, via existing `SET_READY`) | Browser / Client (triggers it) | Reuses the existing `LOBBY-03` ready broadcast — no new server concept, just an existing message sent from a new UI trigger |

## User Constraints

<user_constraints>
### Locked Decisions

- **D-01:** One persistent loadout per player, not a named collection/deck manager. `localStorage` shape is a single `CardId[10]`, seeded from the Phantom preset the first time a player opens the deckbuilder, then freely edited and overwritten in place on every change. — **Reversibility:** costly — every downstream surface (deckbuilder UI, lobby "class" editor, local storage schema) is built against a single-loadout shape; moving to multiple named/saved loadouts later means a storage migration and a new switcher UI, not just a data-model tweak.
- **D-02:** Loading any of the four starter presets (DECK-03) overwrites the single persistent loadout with that preset's card list — it is a reset action, not a merge. (Confirms the single-slot model in D-01: there's only ever one loadout to overwrite.)
- **D-03:** The deckbuilder never blocks an add/remove action. Any edit is allowed immediately, even if it breaks `validateLoadout()`'s rules (exactly 10 cards, max 3 of any icon, ≥2 colors, ≤26 BP). The legality meter (DECK-02) turns red and names exactly what's wrong (e.g. "4th Wiretap — max 3", "27/26 BP"). Save/submit and "take this loadout into a match" are disabled until the loadout is legal again.
- **D-04:** Cards are browsed as a grid grouped/sectioned by icon (Decoy, Wiretap, Strike, Bribe, Safehouse, Agent), with passives in their own section — mirrors how `docs/GAME_DESIGN.md` §6.2 already tables the card pool, so the UI reads the same way the rules doc does.
- **D-05:** Opening the deckbuilder from inside the lobby automatically clears the player's ready state. They must re-confirm ready after closing the editor. This reuses the existing ready-state broadcast from Phase 1 (LOBBY-03) — other seated players just see the ready toggle flip off, no new "editing" indicator needed this phase. Prevents a match starting mid-edit on an unsaved change.

### Claude's Discretion

- Exact visual placement/styling of the legality meter (BP bar, icon-count pips, color checklist) within the deckbuilder layout — no specific layout was locked, only that it must be persistent and update live per DECK-02, not a submit-time check.
- Whether the legality-red state on an individual violating card (e.g. the 4th Wiretop) gets its own inline highlight versus only surfacing in the meter — left to planning/implementation.

### Deferred Ideas (OUT OF SCOPE)

- **Multiple named/saved loadouts (deck manager)** — deferred by D-01; if playtesting shows players want to keep several builds around, this becomes its own future phase with a storage migration.
- **DECK-06 archetype-aware hints** (e.g. flagging an active/passive imbalance in prose) — explicitly not in this phase's requirement list per REQUIREMENTS.md; noted for a later polish phase.
- **In-lobby "editing loadout" indicator for other players** — D-05 only reuses the existing ready-state broadcast; a dedicated "Player X is editing their loadout" signal was not requested and is left for later if it turns out to matter.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-04 | User can access the deckbuilder from the home page | `/deck` route already documented as expected in `apps/web/app/CLAUDE.md`; `<Deckbuilder>` mounted standalone, persisting to localStorage only (no room connection needed at this entry point) |
| DECK-01 | User can build a 10-card loadout choosing from all available cards | `ACTIVE_CARDS`/`PASSIVE_CARDS`/`ALL_CARDS` from `packages/engine/src/content/cards.ts` are the full pool to render; `getCard`/`tryGetCard` for id→card lookups |
| DECK-02 | Deckbuilder enforces loadout legality live via a persistent visual meter | `validateLoadout(loadout, ruleset)` returns `LoadoutViolation[]` with typed `code` + human `message` per violation; `budgetPointsOf(loadout)` for the BP bar; call on every add/remove, never only at submit |
| DECK-03 | User can load one of the four starter preset loadouts with one click | `STARTER_LOADOUTS` map (`PHANTOM`/`HUNTER`/`OLIGARCH`/`SPIDER`) in `packages/engine/src/content/loadouts.ts`, already validated legal by `tests/loadout.test.ts` |
| DECK-04 | User's saved loadouts persist in browser local storage across sessions | `apps/web/lib/identity.ts` is the reference pattern: stable `STORAGE_KEY`, `StorageLike` interface, hydrate-or-generate, corrupt-JSON discard-and-regenerate |
| DECK-05 | User can edit their loadout from within the lobby, using the same deckbuilder component as the home page | Same `<Deckbuilder>` component embedded in `apps/web/app/lobby/[code]/page.tsx`; opening it sends the existing `SET_READY {ready:false}` message (D-05); closing/saving requires the new `SUBMIT_LOADOUT` message so the room's copy of the loadout is current before match start |
</phase_requirements>

## Standard Stack

No new external dependencies are required for this phase. Everything needed already exists in the workspace:

| Library | Version | Purpose | Why Standard (in this repo) |
|---------|---------|---------|------------------------------|
| `zustand` | already in `apps/web` (see `matchStore.ts`, `uiStore.ts`) | New `loadoutStore.ts` follows the exact same store shape | `apps/web/lib/CLAUDE.md` documents Zustand as the established store convention |
| `zod` | already in `packages/shared` | Extending `clientMessageSchema` with `SUBMIT_LOADOUT` | `packages/shared/CLAUDE.md`: "Zod schemas are the source of truth for wire types" |
| `@berlin/engine` | workspace package | `validateLoadout`, `budgetPointsOf`, `consumablePassivesIn`, `ACTIVE_CARDS`, `PASSIVE_CARDS`, `ALL_CARDS`, `STARTER_LOADOUTS`/`PHANTOM`/`HUNTER`/`OLIGARCH`/`SPIDER`, `getCard`/`tryGetCard`, `isActive`/`isPassive` | All exported through `packages/engine/src/index.ts:20-28` `[VERIFIED: packages/engine/src/index.ts:20-28]` — no deep imports permitted |
| `@berlin/shared` | workspace package | `Loadout`, `LoadoutViolation`, `Card`, `ActiveCard`, `PassiveCard`, `CardId`, `IconType`, `ICONS`, `Sector`, `SECTORS` | Type-only imports; the deckbuilder never constructs these by hand |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `validateLoadout()` from the engine | A client-side re-implementation of the legality rules for "instant" feedback | Forbidden by the phase's own canonical references — "the deckbuilder's live meter must call, not reimplement" these functions. `validateLoadout` is a pure, synchronous, in-memory function over a 34-card array; there is no performance reason to duplicate it, and duplicating it creates exactly the drift risk `docs/CLAUDE.md` warns against ("a rule that exists only in an implementation is a bug waiting to be 'fixed'") |
| A new `loadoutStore.ts` Zustand store | Extending `matchStore.ts` or `uiStore.ts` | `matchStore` holds server-authoritative `PlayerView`/`LobbySnapshot` state; `uiStore` holds match-round UI state (selected agent, drafts, reveal). Neither's stated responsibility (`apps/web/lib/CLAUDE.md`) covers a pre-match, localStorage-backed draft that must survive across the home route and the lobby route. A dedicated store keeps the boundary the same way `identity.ts` already does for player identity — a sibling concern, not a modification of either existing store |

**Installation:** None — no new packages.

**Version verification:** N/A — no new packages to verify against a registry this phase.

## Package Legitimacy Audit

Not applicable. This phase introduces zero new external packages; it composes existing workspace packages (`@berlin/engine`, `@berlin/shared`) and the already-installed `zustand`/`zod`. No `npm view`/registry check is required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Home page (/)                     Lobby page (/lobby/[code])
      │                                    │
      ▼                                    ▼
  "Build Loadout" link            "Edit Loadout" button
      │                                    │
      ▼                                    ▼
  /deck route  ─────────┐         Deckbuilder opened in-place
      │                 │                  │
      ▼                 │                  ▼
 <Deckbuilder/>  ◀───────┴──────▶  <Deckbuilder/> (same component)
  (presentational: cards[], loadout[], violations[], onAdd, onRemove, onLoadPreset)
      │                                    │
      ▼                                    ▼
 loadoutStore (Zustand)             loadoutStore (Zustand, same instance)
   ├─ hydrate from localStorage on mount (client-only, StorageLike guard)
   ├─ on every change: call engine.validateLoadout(loadout, ruleset)
   │                    call engine.budgetPointsOf(loadout)          → live meter
   └─ persist to localStorage (saveLoadout) on every change
      │                                    │
      │                          (lobby only, on open)
      │                                    ▼
      │                          socket.send(SET_READY {ready:false})
      │                                    │
      │                          (lobby only, on save/close, loadout legal)
      │                                    ▼
      │                          socket.send(SUBMIT_LOADOUT {cards})
      │                                    │
      ▼                                    ▼
  (nothing further —              apps/party room: handleSubmitLoadout
   localStorage is enough           validates with engine.validateLoadout()
   for the home-page entry           again server-side, stores on RoomSeat.loadout
   point; no match exists yet)              │
                                             ▼
                                   startMatch(): buildMatchConfig() /
                                   post-createMatch loadout assignment reads
                                   RoomSeat.loadout instead of hardcoded PHANTOM
```

### Recommended Project Structure
```
apps/web/
├── app/
│   ├── deck/
│   │   └── page.tsx          # NEW — home-page entry point (HOME-04), 'use client'
│   └── lobby/[code]/
│       └── page.tsx          # MODIFIED — embeds <Deckbuilder/> behind an open/close toggle
├── components/
│   └── deck/                 # NEW directory — already an "expected structure" entry in
│       │                     # apps/web/components/CLAUDE.md ("Loadout builder: card grid,
│       │                     # actives/passives balance readout, constraint validator, presets")
│       ├── Deckbuilder.tsx   # Presentational shell — composes the pieces below
│       ├── CardGrid.tsx      # Icon-grouped grid (D-04), renders ActiveCard + PassiveCard
│       ├── LegalityMeter.tsx # BP bar + icon-count pips + color checklist (DECK-02)
│       └── PresetPicker.tsx  # Four preset buttons (DECK-03)
└── lib/
    └── loadoutStore.ts       # NEW — Zustand store; hydrate/persist/derive-legality
```

### Pattern 1: Hydrate-on-mount localStorage store (mirrors `identity.ts`)
**What:** A Zustand store whose initial state is *not* read from localStorage at module scope (which would break under SSR/RSC and cause a hydration mismatch), but hydrated inside a client-only effect after mount — exactly how `apps/web/lib/identity.ts` gates `browserStorage()` behind `typeof window === 'undefined'`.
**When to use:** Any client store backed by `localStorage` in this Next.js App Router codebase.
**Example:**
```typescript
// Source: apps/web/lib/identity.ts:76-78, 120-135 [VERIFIED: apps/web/lib/identity.ts:76-141]
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function loadIdentity(storage: StorageLike | null = browserStorage()): Identity {
  if (storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isValidIdentity(parsed)) return parsed;
      } catch {
        // corrupt or non-JSON value — fall through and regenerate
      }
    }
  }
  const fresh = freshIdentity();
  saveIdentity(fresh, storage);
  return fresh;
}
```
The new `loadoutStore.ts` should follow this exact shape: a `StorageLike`-typed `loadLoadout()`/`saveLoadout()` pair, a stable `STORAGE_KEY` (e.g. `'berlin1988.loadout'`, following the `identity.ts` naming convention `'berlin1988.identity'` — `[VERIFIED: apps/web/lib/identity.ts:16]` `const STORAGE_KEY = 'berlin1988.identity';`), and a corrupt/missing-value fallback of `[...PHANTOM]` per D-01 ("seeded from the Phantom preset the first time a player opens the deckbuilder").

### Pattern 2: Legality as a derived value, not stored state
**What:** Call `validateLoadout(loadout, ruleset)` and `budgetPointsOf(loadout)` inside a selector or a small hook (e.g. `useLoadoutLegality(loadout)`) every render — do not store `violations`/`budgetPoints` in the Zustand store itself.
**When to use:** Any place DECK-02's live meter needs a value.
**Example:**
```typescript
// Source: packages/engine/src/loadout.ts [VERIFIED: packages/engine/src/loadout.ts:1-75]
export function validateLoadout(loadout: Loadout, ruleset: Ruleset): LoadoutViolation[] {
  // ... WRONG_SIZE, UNKNOWN_CARD, ICON_LIMIT, TOO_FEW_COLORS, OVER_BUDGET
}
export function budgetPointsOf(loadout: Loadout): number { /* ... */ }
```
`LoadoutViolation['code']` is exactly `'WRONG_SIZE' | 'UNKNOWN_CARD' | 'ICON_LIMIT' | 'TOO_FEW_COLORS' | 'OVER_BUDGET'` `[VERIFIED: packages/shared/src/cards.ts:61-69]`:
```typescript
export interface LoadoutViolation {
  readonly code:
    | 'WRONG_SIZE'
    | 'UNKNOWN_CARD'
    | 'ICON_LIMIT'
    | 'TOO_FEW_COLORS'
    | 'OVER_BUDGET';
  readonly message: string;
}
```
The `message` field is already human-readable (e.g. `` `At most ${ruleset.maxPerIcon} ${icon} cards allowed, got ${n}.` `` `[VERIFIED: packages/engine/src/loadout.ts:38-44]`) — the meter can render it directly rather than re-deriving copy from the `code`.

### Pattern 3: One presentational component, two host contexts
**What:** `<Deckbuilder>` takes `loadout: CardId[]`, `onAdd(cardId)`, `onRemove(cardId)`, `onLoadPreset(preset)` as props and renders `CardGrid` + `LegalityMeter` + `PresetPicker`. It performs no localStorage or network I/O itself (`apps/web/components/CLAUDE.md`: "Nothing here fetches. Socket access and stores live in `lib/`; components take props and callbacks").
**When to use:** Both `app/deck/page.tsx` (reads/writes `loadoutStore` directly, no socket) and `app/lobby/[code]/page.tsx` (reads/writes `loadoutStore`, *additionally* sends `SET_READY`/`SUBMIT_LOADOUT` on open/save).
**Why it matters:** Keeps the two host contexts different only in *persistence plumbing*, not in rendering or interaction logic — the exact "same deckbuilder component" DECK-05 and D-05 require.

### Pattern 4: Rejection-not-throw for a new inbound message (mirrors `submitOrder`)
**What:** `SUBMIT_LOADOUT`'s handler should return an accept/reject shape exactly like `handleSubmitOrder` does for `SUBMIT_ORDER` — never throw, never block on a client-side-only precondition. `apps/party/src/CLAUDE.md` rule 2 requires every inbound message to be Zod-validated before touching the engine, and the codebase's established error-handling convention (`CLAUDE.md` root doc, "Error Handling") is "no exceptions for rule violations."
**Example:**
```typescript
// Source: apps/party/src/handlers.ts:229-288 [VERIFIED: apps/party/src/handlers.ts:229-288]
export function handleSubmitOrder(
  state: RoomState | null,
  message: Extract<ClientMessage, { type: 'SUBMIT_ORDER' }>,
  connectionId: string,
): SubmitOrderResult {
  // ... seatFor(connectionId) resolves the acting seat — never trusts a
  // playerId in the message body — then re-validates against the room's
  // own authoritative state before accepting.
}
```
A `handleSubmitLoadout` should follow the same shape: resolve the seat via `seatFor(state, connectionId)` (never a `playerId` field on the message — `apps/party/src/CLAUDE.md` rule 2), then call `validateLoadout(message.cards, ruleset)` server-side as the authoritative check (the client-side disable-until-legal UI from D-03 is UX only, exactly how `codenameSchema`'s client-side cap is UX-only while the Zod schema is authoritative — `packages/shared/src/protocol.ts:19`).

### Anti-Patterns to Avoid
- **Reading `localStorage` at Zustand store module scope:** `create<T>((set) => ({ loadout: loadLoadout() ...}))` evaluated at import time runs during SSR too, where `window` doesn't exist — `identity.ts` avoids this by taking `storage` as a parameter with a lazy default, and callers invoke `loadIdentity()` inside a `useState(() => loadIdentity())` initializer (see `apps/web/app/lobby/[code]/page.tsx:20`, `[VERIFIED: apps/web/app/lobby/[code]/page.tsx:20]` `const [identity] = useState(() => loadIdentity());`) — the same lazy-initializer pattern applies to the loadout store's hydration.
- **Broadcasting a seat's loadout to other lobby members:** `lobbySeatSchema` (`packages/shared/src/protocol.ts:122-129`) has no field for it today, and nothing in `docs/GAME_DESIGN.md` §6.3 (Burn Track) suggests loadout contents are public before a card is actually played — only *usage* is public, not the dossier itself. Do not add a `loadout` field to `lobbySeatSchema`/`LobbySeat`; keep it server-only on `RoomSeat`.
- **Reimplementing the four starter presets as UI-local constants:** `PHANTOM`/`HUNTER`/`OLIGARCH`/`SPIDER` already exist as reviewed data in `packages/engine/src/content/loadouts.ts`, validated legal by the package's own test suite. Import them; don't re-type the card-id lists in `apps/web`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| "Is this loadout legal?" | A parallel BP/icon-count/color-count calculator in `apps/web` | `validateLoadout(loadout, ruleset)` + `budgetPointsOf(loadout)` from `@berlin/engine` | The phase's own canonical references are explicit: "the deckbuilder's live meter must call, not reimplement" these functions; a UI-side reimplementation is exactly the "second rules implementation" the monorepo's dependency direction rule exists to prevent |
| Starter preset card lists | Hardcoded `CardId[]` arrays per preset inside a component | `STARTER_LOADOUTS` / `PHANTOM` / `HUNTER` / `OLIGARCH` / `SPIDER` from `packages/engine/src/content/loadouts.ts` | Already reviewed and validated legal by `tests/loadout.test.ts`; a UI-local copy can drift from a future card-cost rebalance (`packages/engine/src/content/CLAUDE.md` flags Budget Point costs as "the main deck-balance lever... expect them to move a lot") |
| Loadout persistence with no login | A custom localStorage wrapper, a cookie, or IndexedDB | The `identity.ts` pattern: fixed key, `StorageLike` interface, JSON serialize/parse, discard-and-regenerate on corruption | Already implemented, reviewed, and tested (`apps/web/lib/identity.test.ts`) for exactly this "no accounts, browser-storage-only" persistence model; a second bespoke pattern is unnecessary surface area |

**Key insight:** Every piece of "logic" this phase needs — what counts as legal, what the four presets contain, how to persist without an account — already exists as tested code or a tested pattern elsewhere in the repo. The actual net-new work is wiring: a component tree, a store, and one wire message.

## Runtime State Inventory

Not applicable — this is a greenfield feature phase (new route, new component directory, new store, new wire message), not a rename/refactor/migration phase. No existing stored data, live service config, OS-registered state, or build artifacts reference anything being renamed.

One adjacent note for the planner: the `PHANTOM` hardcode this phase removes (`apps/party/src/settings.ts:53-67`) is currently covered by an assertion in `apps/party/tests/botfill.test.ts:117-122` ("after startMatch, phase is IN_GAME, gameState is non-null, and every loadout is PHANTOM"). That test will need to change to assert per-seat loadouts instead of a blanket `PHANTOM` — flagged here so it isn't discovered as a surprise test failure mid-implementation.

## Common Pitfalls

### Pitfall 1: SSR/CSR hydration mismatch from reading localStorage too early
**What goes wrong:** A component or store that reads `localStorage` during the initial render (rather than after mount) produces a server-rendered HTML tree that doesn't match the client's first paint, which Next.js flags as a hydration error — or, worse, silently renders the wrong initial loadout for one frame before snapping to the real one.
**Why it happens:** `apps/web/app/deck/page.tsx` and the lobby route are both Client Components, but Client Components still run an initial server-render pass in Next.js's App Router; `window`/`localStorage` are undefined at that point.
**How to avoid:** Follow `identity.ts`'s exact guard (`typeof window === 'undefined' ? null : window.localStorage`) and the `useState(() => loadIdentity())` lazy-initializer callsite pattern already used in `apps/web/app/lobby/[code]/page.tsx:20`. Apply the identical shape to the loadout store's hydration.
**Warning signs:** React hydration warnings in the browser console; a preset or a stale loadout flashing briefly on `/deck` load.

### Pitfall 2: Client-only legality check drifts from what the room will accept
**What goes wrong:** If the deckbuilder's "Save/submit disabled until legal" gate (D-03) is implemented with any logic other than a direct call to `validateLoadout()`, a loadout the UI shows as legal could still be rejected by the room's own authoritative `validateLoadout()` call at `SUBMIT_LOADOUT` time (or vice versa) — a confusing, hard-to-reproduce bug class.
**Why it happens:** Two call sites (client preview, server authority) computing "is this legal" independently, even with the same intended rules.
**How to avoid:** Both call sites must call the *same* `validateLoadout` export from `@berlin/engine` against the *same* ruleset (`DEFAULT_RULESET`/`getRuleset('default')`) — this is structurally guaranteed as long as neither side reimplements the check, which is the phase's explicit constraint already.
**Warning signs:** A "Save" button that's enabled client-side but the room replies with a rejection; conversely, a legal loadout the UI marks illegal.

### Pitfall 3: Forgetting the room needs a `SUBMIT_LOADOUT` message that doesn't exist yet
**What goes wrong:** Planning treats "persist to localStorage" as the whole of DECK-04/DECK-05 and never wires the loadout into the room, so `startMatch` keeps using the `PHANTOM` hardcode (or an equally wrong default) regardless of what the player built.
**Why it happens:** `docs/ARCHITECTURE.md` §5 already lists `SUBMIT_LOADOUT` in its protocol table, which can read as "already implemented" on a skim — it is not. `packages/shared/src/protocol.ts`'s actual `clientMessageSchema` (as of this research) has exactly five members: `CREATE`, `JOIN`, `SET_READY`, `SET_CODENAME`, `SUBMIT_ORDER` `[VERIFIED: packages/shared/src/protocol.ts:62-89]` — no `SUBMIT_LOADOUT`. Similarly `apps/party/src/handlers.ts` has no `handleSubmitLoadout`, and `apps/party/src/state.ts`'s `RoomSeat` interface has no `loadout` field `[VERIFIED: apps/party/src/state.ts:34-44]`.
**How to avoid:** Treat the wire message, the room handler, the `RoomSeat.loadout` field, and the `startMatch` change as one connected unit of work this phase — the plan must include all four, not just the client-side deckbuilder.
**Warning signs:** Success Criterion 5 ("the match is played with that loadout") fails even though the deckbuilder UI itself works perfectly.

### Pitfall 4: Overwriting bot seats' loadouts along with human seats'
**What goes wrong:** `startMatch`'s current loop applies `[...PHANTOM]` to *every* entry in `gameState.players`, human and bot alike (`apps/party/src/settings.ts:55-67`). A naive fix that swaps `PHANTOM` for `humanLoadoutFor(seat)` without branching on `seat.kind` will either crash (no persisted loadout exists for a bot seat) or silently assign a human's loadout data structure to a bot.
**Why it happens:** The loop in `settings.ts` doesn't currently distinguish player kind — it didn't need to, because every seat got the same literal value.
**How to avoid:** Branch on `seat.kind === 'BOT'` (or equivalently, whether `RoomSeat.loadout` was ever set via `SUBMIT_LOADOUT`) and leave bot seats on `createMatch`'s own per-faction default (`defaultLoadoutFor(seat.faction)` in `packages/engine/src/createMatch.ts:126-137`, which `startMatch` currently discards for every seat) rather than trying to route them through the new human-facing flow. Bot loadout customization (`AIAgent.buildLoadout`, `packages/ai/src/agent.ts:97-107`) exists in the AI package but is never called from `apps/party` today — wiring it up is out of this phase's scope (LOBBY-07 is Phase 3).
**Warning signs:** A bot-filled seat (LOBBY-05) crashing at match start, or every bot fielding an identical, human-authored loadout that doesn't match its assigned personality.

### Pitfall 5: `LobbySeat`/`lobbySeatSchema` growing a `loadout` field it doesn't need
**What goes wrong:** Adding `loadout: CardId[]` to the public lobby snapshot schema so "everyone can see who's playing what" — this leaks pre-match deckbuilding information that `docs/GAME_DESIGN.md` §6.3 implies should stay private until cards are actually *used* (only usage is public, via the Burn Track).
**Why it happens:** It can feel natural to want to show "Seat 2 is ready" alongside "Seat 2 built a Hunter-style deck," especially since `SeatList.tsx` already renders per-seat state.
**How to avoid:** Keep `loadout` on the server-only `RoomSeat` (`apps/party/src/state.ts`), never surfaced in `toSnapshot()`'s `LobbySeat` projection. No requirement in this phase's scope (HOME-04, DECK-01..05) asks for cross-player loadout visibility.
**Warning signs:** A code review or a fog-of-war-style leak test failing because opponent loadout contents appear in a `ROOM_STATE` frame.

## Code Examples

### Grouping the card pool by icon (D-04)
```typescript
// Source: packages/shared/src/enums.ts:5-14 [VERIFIED: packages/shared/src/enums.ts:5-14]
export type IconType = 'AGENT' | 'WIRETAP' | 'BRIBE' | 'DECOY' | 'SAFEHOUSE' | 'STRIKE';
export const ICONS: readonly IconType[] = [
  'AGENT',
  'WIRETAP',
  'BRIBE',
  'DECOY',
  'SAFEHOUSE',
  'STRIKE',
] as const;
```
Use the canonical `ICONS` export as the section-ordering source rather than hand-typing a new order in the component — it is the one place in the codebase the icon order is already declared, and matches every card's `icon` field (`ActiveCard.icon`/`PassiveCard.icon`, both typed `IconType`). Note this canonical order (`AGENT, WIRETAP, BRIBE, DECOY, SAFEHOUSE, STRIKE`) differs from the informal listing order in `02-CONTEXT.md`'s D-04 prose ("Decoy, Wiretap, Strike, Bribe, Safehouse, Agent") — neither ordering is normatively locked by a decision, so using the single canonical `ICONS` array avoids introducing a second, hand-maintained ordering.

### The full card pool and starter presets, as they actually exist
```typescript
// Source: packages/engine/src/content/cards.ts:51,90 and content/loadouts.ts:61-66
// [VERIFIED: packages/engine/src/content/cards.ts:51-103, packages/engine/src/content/loadouts.ts:9-66]
export const ACTIVE_CARDS: readonly ActiveCard[] = [ /* 24 cards: 6 icons × 4 sectors */ ];
export const PASSIVE_CARDS: readonly PassiveCard[] = [ /* 10 named passives */ ];
export const ALL_CARDS: readonly Card[] = [...ACTIVE_CARDS, ...PASSIVE_CARDS];

export const STARTER_LOADOUTS: Record<string, Loadout> = {
  PHANTOM, HUNTER, OLIGARCH, SPIDER,
};
```
34 total cards (24 active + 10 passive) — the grid this phase renders is a fixed, known size, not a paginated or virtualized list.

### Loadout wire types already defined
```typescript
// Source: packages/shared/src/cards.ts:51-59, state.ts:57, view.ts:84
// [VERIFIED: packages/shared/src/cards.ts:51-59, packages/shared/src/state.ts:57, packages/shared/src/view.ts:84]
export type Loadout = readonly CardId[];
export interface LoadoutConstraints {
  readonly size: number;
  readonly maxPerIcon: number;
  readonly minColors: number;
  readonly maxBudgetPoints: number;
}
// state.ts (server, per player): loadout: CardId[];
// view.ts (client-safe, self only): readonly loadout: readonly CardId[];
```
`PlayerView.self.loadout` already exists on the client-safe view type — a player's *own* loadout is not fog-of-war-hidden from themselves, only from opponents. This is what the match-side UI (`packages/ai/src/features.ts:321`, `view.self.loadout.some(...)`) already reads, and it is exactly what a legal `SUBMIT_LOADOUT` should populate at match start via `GameState.players[id].loadout`, replacing the current `[...PHANTOM]` literal.

### The missing wire message, as documented (to be implemented this phase)
```typescript
// Source: docs/ARCHITECTURE.md §5 [CITED: docs/ARCHITECTURE.md §5, line 185]
// | `SUBMIT_LOADOUT` | `{ cards: CardId[] }` |
```
Not yet present in `packages/shared/src/protocol.ts`'s `clientMessageSchema` (5 members today: `CREATE`, `JOIN`, `SET_READY`, `SET_CODENAME`, `SUBMIT_ORDER` — `[VERIFIED: packages/shared/src/protocol.ts:62-89]`). Adding it should follow the existing `cardIdOnWire` transform already defined in the same file (`[VERIFIED: packages/shared/src/protocol.ts:27]` `const cardIdOnWire = z.string().transform((s) => cardId(s));`):
```typescript
z.object({
  type: z.literal('SUBMIT_LOADOUT'),
  cards: z.array(cardIdOnWire),
}),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Every seat plays `PHANTOM` regardless of who's seated (`apps/party/src/settings.ts:53-67`) | Human seats play their own persisted loadout; bot seats keep a per-faction or personality default | This phase | `apps/party/tests/botfill.test.ts:117-122`'s "every loadout is PHANTOM" assertion must be rewritten, not just left passing by coincidence |
| `RoomPhase` includes an unused `'LOADOUT'` value reserved for "Plan 01-02's deckbuilder" (per the type's own comment, `apps/party/src/state.ts:12-18`) `[VERIFIED: apps/party/src/state.ts:12-19]` | Whether this phase actually transitions the room through a `LOADOUT` room-phase state, or handles loadout submission entirely within `LOBBY`, is an open implementation choice — see Open Questions | This phase | Affects whether `startMatch`'s existing `state.phase !== 'LOBBY' && state.phase !== 'LOADOUT'` guard needs any change at all (it already tolerates both) |

**Deprecated/outdated:** None — this is the first phase touching the deckbuilder; there is no prior deckbuilder implementation to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `SUBMIT_LOADOUT` should be sent (a) once right after a successful `JOIN`/`CREATE` handshake with whatever is in localStorage, and (b) again whenever the in-lobby deckbuilder is saved/closed — rather than, e.g., only on explicit "Ready" click, or on every keystroke/click inside the deckbuilder. | Architecture Patterns, Pattern 3; Diagram | If the planner picks a different trigger (e.g. loadout only sent on Ready-up), Success Criterion 5 ("the match is played with that loadout") could still hold, but the specific UX timing (does closing the editor without explicit Ready re-send it?) needs to be nailed down in planning, not assumed from research alone |
| A2 | Bot seats should keep their existing per-faction default (`defaultLoadoutFor`) or literal `PHANTOM`, rather than this phase wiring `AIAgent.buildLoadout()` into `apps/party`. | Pitfall 4 | If wrong, a planner might scope in bot-loadout personalization that belongs to LOBBY-07 (Phase 3), inflating this phase's surface area beyond HOME-04/DECK-01..05 |
| A3 | The room does not need a distinct `RoomPhase: 'LOADOUT'` transition to satisfy this phase's requirements — `SUBMIT_LOADOUT` can be handled while `state.phase === 'LOBBY'`, mirroring how `SET_READY`/`SET_CODENAME` are already handled in `LOBBY`. | State of the Art table; Open Questions | If wrong (e.g. if a future phase's UX wants a hard "everyone confirms loadout" gate before Ready), the existing unused `'LOADOUT'` enum value might need activation this phase rather than later — low risk since CONTEXT.md's decisions don't describe a loadout-confirmation gate, only free editing at any time pre-match |
| A4 | `STORAGE_KEY` for the new loadout store should be a sibling of `'berlin1988.identity'`, e.g. `'berlin1988.loadout'`, following the same dotted-namespace convention. | Pattern 1 | Purely cosmetic if wrong — no functional risk, just a naming-consistency nit for planning to confirm |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Does `SUBMIT_LOADOUT` need to be gated behind a full server-side `validateLoadout()` rejection path (a new `ServerMessage` variant, e.g. `LOADOUT_REJECTED`), or is it acceptable to silently store whatever the client sends and only enforce legality at `startMatch` time?**
   - What we know: `handleSubmitOrder` demonstrates the established accept/reject pattern (`ORDER_ACK`/`ORDER_REJECTED`) for a comparable inbound message; D-03 already makes the *client* refuse to offer "Save" until legal, so a malicious or buggy client is the only path to an illegal `SUBMIT_LOADOUT` payload reaching the room.
   - What's unclear: Whether the phase needs a new `ServerMessage` variant (more wire-protocol surface) or whether `startMatch` re-running `validateLoadout()` per seat and falling back to a safe default (e.g. that seat's `PHANTOM`) for an illegal stored loadout is sufficient defense-in-depth.
   - Recommendation: Favor the simpler option — validate again at `startMatch` with a safe fallback — unless the planner has a concrete UX reason for live server-side rejection feedback in the lobby (D-03's client-side gate already the primary UX signal).

2. **Should the in-lobby deckbuilder be a full-screen route swap, an inline panel, or a modal overlay within `app/lobby/[code]/page.tsx`?**
   - What we know: D-05 only specifies *behavior* (opening clears ready state, closing requires re-confirming ready) — no layout is locked, and the phase's own "Claude's Discretion" section explicitly leaves visual placement open.
   - What's unclear: Whether reusing `<Deckbuilder>` via client-side conditional rendering inside the existing lobby page (simplest, no route change, no risk of losing the room socket connection) is preferable to a route like `/lobby/[code]/deck` (cleaner URL semantics, but risks the `useRoomSocket` connection lifecycle — reconnecting on route change would need to reuse the existing token-rebind path in `apps/web/lib/socket.ts:100-114`).
   - Recommendation: Conditional in-place rendering within the existing lobby page component is lower-risk — it keeps the one `useRoomSocket` connection alive for the whole lobby session rather than tearing it down and rebinding via token on a route change.

3. **Where does the `Ruleset` the deckbuilder validates against come from on the client (home-page `/deck` route, before any match/room exists)?**
   - What we know: `validateLoadout(loadout, ruleset)` requires a `Ruleset` argument; `DEFAULT_RULESET`/`getRuleset('default')` are exported from `packages/engine`'s content barrel (`export * from './content/index.js'` in `packages/engine/src/index.ts:28`); `apps/party/src/settings.ts:36` hardcodes `rulesetId: 'default'` for every match this phase.
   - What's unclear: Nothing rules-wise is genuinely unclear — since the lobby's `MatchSettings.rulesetId` is hardcoded to `'default'` this phase (no host ruleset picker yet), the deckbuilder can safely import `DEFAULT_RULESET` directly at both the home-page and in-lobby entry points with no risk of validating against the wrong ruleset.
   - Recommendation: Import `DEFAULT_RULESET` (or `getRuleset('default')`) directly; no need to thread a ruleset through props or the room until a future phase adds ruleset selection.

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependencies. It uses the existing Node/pnpm/Vitest/Playwright/PartyKit toolchain already verified working in Phase 1 (per `.planning/STATE.md`: `apps/party` deployed and verified live; `apps/web` local dev already exercised via Playwright e2e specs).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (unit/integration), Playwright (e2e) |
| Config file | `vitest.config.ts` (root); `apps/web/playwright.config.ts` (not read this session, referenced by `pnpm test:e2e`) |
| Quick run command | `pnpm test -- loadout` (filters by filename substring) or `pnpm vitest run apps/web/lib/loadoutStore.test.ts` once created |
| Full suite command | `pnpm test` (root `vitest run`, matches `packages/**/tests/**/*.test.ts`, `apps/**/tests/**/*.test.ts`, `apps/**/*.test.ts` per `vitest.config.ts:15-19` `[VERIFIED: vitest.config.ts:14-21]`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| HOME-04 | `/deck` route renders and is reachable from home page | e2e (Playwright) | `pnpm test:e2e -- home` (extend `apps/web/e2e/home.spec.ts` or add `apps/web/e2e/deck.spec.ts`) | ❌ Wave 0 |
| DECK-01 | All `ALL_CARDS` render, grouped by icon; add/remove updates the draft | unit (Vitest, colocated) | `pnpm vitest run apps/web/lib/loadoutStore.test.ts` | ❌ Wave 0 |
| DECK-02 | `validateLoadout`/`budgetPointsOf` drive a live meter that updates on every change, never only at submit | unit (Vitest) — assert the store's derived legality recomputes after each `add`/`remove` call, matching direct `validateLoadout()` output | `pnpm vitest run apps/web/lib/loadoutStore.test.ts` | ❌ Wave 0 |
| DECK-03 | Loading `PHANTOM`/`HUNTER`/`OLIGARCH`/`SPIDER` overwrites the draft entirely (D-02: reset, not merge) | unit (Vitest) | same file | ❌ Wave 0 |
| DECK-04 | Loadout survives a page refresh / fresh session, no login | unit (Vitest, `StorageLike` stub, mirrors `apps/web/lib/identity.test.ts`'s approach) | `pnpm vitest run apps/web/lib/loadoutStore.test.ts` | ❌ Wave 0 |
| DECK-05 | Opening the lobby deckbuilder clears ready state; closing/saving submits the loadout server-side; match uses it | integration (Vitest, `apps/party/tests/`) + e2e | `pnpm vitest run apps/party/tests/loadout.test.ts`; `pnpm test:e2e -- lobby` | ❌ Wave 0 |
| (regression) | `startMatch` assigns per-seat loadouts, not blanket `PHANTOM` | integration (Vitest) — rewrite `apps/party/tests/botfill.test.ts`'s existing "every loadout is PHANTOM" assertion | `pnpm vitest run apps/party/tests/botfill.test.ts` | ✅ exists, needs edit |

### Sampling Rate
- **Per task commit:** `pnpm vitest run <touched test file>`
- **Per wave merge:** `pnpm test` (full suite) + `pnpm typecheck`
- **Phase gate:** Full suite green, plus `pnpm test:e2e` for the new `/deck` and lobby-editing flows, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/web/lib/loadoutStore.test.ts` — covers DECK-01, DECK-02, DECK-03, DECK-04 (store hydration, derive-legality, preset overwrite)
- [ ] `apps/party/tests/loadout.test.ts` — covers DECK-05's server side: `handleSubmitLoadout`, `RoomSeat.loadout`, and `startMatch` reading per-seat loadouts instead of `PHANTOM`
- [ ] `apps/web/e2e/deck.spec.ts` — covers HOME-04 end-to-end (navigate from home, build a loadout, refresh, it persists)
- [ ] Extend `apps/web/e2e/home.spec.ts` or add `apps/web/e2e/lobby.spec.ts` — covers DECK-05's in-lobby flow (open editor → ready clears → save → ready again → match starts with that loadout)
- [ ] Edit (not create) `apps/party/tests/botfill.test.ts` — its current "every loadout is PHANTOM" assertion (`apps/party/tests/botfill.test.ts:117-122`) will fail once the hardcode is removed and must be updated as part of this phase's own test suite, not left as an accidental regression

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | Project has no accounts by design (documented decision, `.planning/STATE.md`: "No accounts for v1 — player name and decks persist via browser local storage") — not a gap, a deliberate scope boundary |
| V3 Session Management | Partial | Seat binding via opaque, server-minted tokens already exists (`apps/party/src/auth.ts`, `seatFor`/`bindConnection`) and is unchanged by this phase; `SUBMIT_LOADOUT` must resolve the acting seat the same way `SET_READY`/`SUBMIT_ORDER` already do — via `seatFor(state, connectionId)`, never a `playerId` in the message body |
| V4 Access Control | Yes | A `SUBMIT_LOADOUT` message must only be able to alter the *sending connection's own* seat's loadout — enforced by the same `seatFor(connectionId)` pattern already used for `SET_READY`/`SET_CODENAME`/`SUBMIT_ORDER` (`apps/party/src/handlers.ts`) |
| V5 Input Validation | Yes | `SUBMIT_LOADOUT`'s `cards` array must be Zod-validated on arrival (card ids as strings, transformed via the existing `cardIdOnWire` pattern) *and* independently re-checked against `validateLoadout()` server-side — the client's D-03 "disable until legal" gate is UX only, never trusted as the sole enforcement (mirrors `codenameSchema`'s client-cap-is-UX-only precedent already in the codebase) |
| V6 Cryptography | No | No new cryptographic material this phase; seat tokens are already `mintToken()`-generated (`apps/party/src/auth.ts`, unchanged) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Client sends a `SUBMIT_LOADOUT` with an id from a foreign namespace or garbage string, hoping `tryGetCard`/`validateLoadout` mishandles it | Tampering | `validateLoadout` already emits `UNKNOWN_CARD` for any id not in `ALL_CARDS`'s lookup map (`packages/engine/src/loadout.ts:19-25`) — no new code needed, just make sure the room actually calls it rather than trusting the wire payload |
| A connection spoofs another seat's loadout by sending a `playerId`/seat index in the `SUBMIT_LOADOUT` payload | Spoofing | Same established mitigation as every other inbound message: resolve the acting seat from `seatFor(state, connectionId)`, never from the message body — do not add a seat-identifying field to the `SUBMIT_LOADOUT` schema at all |
| localStorage tampering (a player edits their own `berlin1988.loadout` value directly in devtools to something illegal) | Tampering | Not a meaningful threat in a "your own deck, your own game" context — the room's server-side `validateLoadout()` re-check at `SUBMIT_LOADOUT`/`startMatch` time is the actual trust boundary, exactly as `identity.ts`'s corrupt-JSON-discard already treats localStorage as untrusted client input |

## Sources

### Primary (HIGH confidence)
- `packages/engine/src/loadout.ts` — read in full this session, `validateLoadout`/`budgetPointsOf`/`consumablePassivesIn` implementations
- `packages/engine/src/content/cards.ts` — read in full, `ACTIVE_CARDS`/`PASSIVE_CARDS`/`ALL_CARDS` and lookup helpers
- `packages/engine/src/content/loadouts.ts` — read in full, the four starter presets and `STARTER_LOADOUTS`
- `packages/engine/src/content/rulesets.ts` — read in full, `DEFAULT_RULESET` (`loadoutSize: 10, maxPerIcon: 3, minColors: 2, maxBudgetPoints: 26`)
- `packages/engine/src/index.ts` — read in full, confirms the public barrel export surface
- `packages/shared/src/cards.ts`, `state.ts` (loadout field), `view.ts` (loadout field), `enums.ts` (ICONS/SECTORS), `protocol.ts` — read in full/relevant sections, confirm wire types and the current (5-member) `clientMessageSchema`
- `apps/web/lib/identity.ts` — read in full, the localStorage persistence pattern reference
- `apps/web/lib/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/web/app/CLAUDE.md`, `apps/web/components/CLAUDE.md` — client architecture conventions
- `apps/party/src/settings.ts`, `state.ts`, `handlers.ts` — read in full, confirm the `PHANTOM` hardcode location and the absence of `SUBMIT_LOADOUT`/`RoomSeat.loadout`
- `apps/party/CLAUDE.md`, `apps/party/src/CLAUDE.md`, `packages/CLAUDE.md`, `packages/engine/CLAUDE.md`, `packages/shared/CLAUDE.md` — architectural constraints
- `docs/GAME_DESIGN.md` §2, §6 — construction rules, starter loadout compositions, Burn Track privacy model
- `docs/ARCHITECTURE.md` §5, §6 — the documented (unimplemented) `SUBMIT_LOADOUT` message, testing strategy
- `.planning/phases/02-deckbuilder-persistent-loadouts/02-CONTEXT.md` — locked decisions D-01 through D-05
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — requirement text and project decision history

### Secondary (MEDIUM confidence)
- None used — no web/docs-lookup research was needed this phase; every question was answerable from the repository itself.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every referenced function/type was read directly from source this session
- Architecture: HIGH — component/store structure follows two already-documented, already-used patterns (`identity.ts`, `matchStore.ts`/`uiStore.ts`); the one genuinely new piece (`SUBMIT_LOADOUT`) is itself already specified in `docs/ARCHITECTURE.md`
- Pitfalls: HIGH — each pitfall is grounded in a specific file/line read this session (the `PHANTOM` overwrite loop, the missing schema member, the missing `RoomSeat` field, the existing `botfill.test.ts` assertion that will need editing)

**Research date:** 2026-08-27
**Valid until:** No hard expiry — this research is grounded entirely in the current state of the repository, not external library versions. Re-verify the "Standard Stack"/file-line citations if significant refactoring lands on `packages/engine`, `packages/shared`, or `apps/party/src/settings.ts`/`state.ts` before this phase is planned.
