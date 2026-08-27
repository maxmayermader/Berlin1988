# Phase 2: Deckbuilder & Persistent Loadouts - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Players build and keep their own 10-card loadout and take it into a match, replacing the hardcoded Phantom default that Phase 1 shipped with. One persistent loadout per player, editable from the home page and from inside the lobby via the same deckbuilder component, seeded from one of the four starter presets and legal per `packages/engine`'s existing `validateLoadout()` rules. No deck-slot manager, no archetype-hint UI (DECK-06, deferred), no card unlocks or progression — every card is available to everyone from round one, exactly as it is in Phase 1.

Requirements covered: HOME-04, DECK-01, DECK-02, DECK-03, DECK-04, DECK-05.

</domain>

<decisions>
## Implementation Decisions

### Saved Loadout Model
- **D-01:** One persistent loadout per player, not a named collection/deck manager. `localStorage` shape is a single `CardId[10]`, seeded from the Phantom preset the first time a player opens the deckbuilder, then freely edited and overwritten in place on every change. — **Reversibility:** costly — every downstream surface (deckbuilder UI, lobby "class" editor, local storage schema) is built against a single-loadout shape; moving to multiple named/saved loadouts later means a storage migration and a new switcher UI, not just a data-model tweak.
- **D-02:** Loading any of the four starter presets (DECK-03) overwrites the single persistent loadout with that preset's card list — it is a reset action, not a merge. (Confirms the single-slot model in D-01: there's only ever one loadout to overwrite.)

### Illegal-State Handling
- **D-03:** The deckbuilder never blocks an add/remove action. Any edit is allowed immediately, even if it breaks `validateLoadout()`'s rules (exactly 10 cards, max 3 of any icon, ≥2 colors, ≤26 BP). The legality meter (DECK-02) turns red and names exactly what's wrong (e.g. "4th Wiretap — max 3", "27/26 BP"). Save/submit and "take this loadout into a match" are disabled until the loadout is legal again.

### Card Browsing Layout
- **D-04:** Cards are browsed as a grid grouped/sectioned by icon (Decoy, Wiretap, Strike, Bribe, Safehouse, Agent), with passives in their own section — mirrors how `docs/GAME_DESIGN.md` §6.2 already tables the card pool, so the UI reads the same way the rules doc does.

### In-Lobby Edit Behavior
- **D-05:** Opening the deckbuilder from inside the lobby automatically clears the player's ready state. They must re-confirm ready after closing the editor. This reuses the existing ready-state broadcast from Phase 1 (LOBBY-03) — other seated players just see the ready toggle flip off, no new "editing" indicator needed this phase. Prevents a match starting mid-edit on an unsaved change.

### Claude's Discretion
- Exact visual placement/styling of the legality meter (BP bar, icon-count pips, color checklist) within the deckbuilder layout — no specific layout was locked, only that it must be persistent and update live per DECK-02, not a submit-time check.
- Whether the legality-red state on an individual violating card (e.g. the 4th Wiretop) gets its own inline highlight versus only surfacing in the meter — left to planning/implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Loadout & Card Rules
- `docs/GAME_DESIGN.md` §6 (6.1 Construction rules, 6.2 The Passive cards, 6.4 Starter loadouts) — the exact legality rules (10 cards, max 3/icon, ≥2 colors, ≤26 BP) and the four starter loadout compositions this phase's presets must match
- `packages/engine/src/loadout.ts` (exported as `validateLoadout`, `budgetPointsOf`, `consumablePassivesIn` via `packages/engine/src/index.ts`) — the actual legality-checking functions the deckbuilder's live meter must call, not reimplement
- `packages/engine/src/content/cards.ts` — `ACTIVE_CARDS`, `PASSIVE_CARDS`, `ALL_CARDS` — the full card pool to browse/select from
- `packages/engine/src/content/loadouts.ts` — `PHANTOM`, `HUNTER`, `OLIGARCH`, `SPIDER` — the four starter presets (DECK-03)

### Persistence & Client Architecture
- `apps/web/lib/identity.ts` — existing `localStorage`-backed persistence pattern (Phase 1 D-09, `STORAGE_KEY` convention) to follow for the loadout's own storage key
- `apps/web/lib/CLAUDE.md` — client-side plumbing conventions (Zustand stores, one-network-touchpoint rule, optimistic-preview-is-advisory rule) that any new deckbuilder store must follow

### Lobby Integration
- `.planning/phases/01-playable-skeleton/01-CONTEXT.md` — D-01 (every seat currently hardcodes Phantom — this phase removes that hardcode), D-09 (identity persistence pattern), D-10 (styling baseline: clean but plain Tailwind, no theming yet)
- `apps/web/app/lobby/[code]/page.tsx` and the existing ready-up wiring (LOBBY-03/04 from Phase 1) — D-05's "opening the editor clears ready state" reuses this existing broadcast path

### Requirements Traceability
- `.planning/REQUIREMENTS.md` — HOME-04, DECK-01 through DECK-05 (this phase); DECK-06 (archetype hints) explicitly NOT in this phase's requirement list — out of scope, do not build

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/engine`'s `validateLoadout`, `budgetPointsOf`, `consumablePassivesIn` already exist, tested, and are exported from the package's public surface — the deckbuilder's legality meter is a UI over these, not new validation logic
- `packages/engine/src/content/cards.ts` and `loadouts.ts` already contain the full card pool and all four starter presets as reviewed data — nothing to author, only to render
- `apps/web/lib/identity.ts` is a working, reviewed example of the exact `localStorage` persistence pattern this phase needs (stable key, hydration on load, no login)

### Established Patterns
- `apps/web/lib/CLAUDE.md` documents the store conventions already in use (`matchStore.ts`, `uiStore.ts` as Zustand stores) — a new loadout store should follow the same shape
- Phase 1 hardcodes every seat to the Phantom preset (`01-CONTEXT.md` D-01) — this is the specific hardcode this phase removes, replacing it with each player's persisted loadout

### Integration Points
- Home page needs a new deckbuilder entry point/route (HOME-04)
- Lobby page (`apps/web/app/lobby/[code]/page.tsx`) needs the same deckbuilder component embedded, wired to clear ready state on open (D-05)
- Wherever Phase 1 currently passes `PHANTOM` into match creation needs to instead read each player's persisted loadout

</code_context>

<specifics>
## Specific Ideas

- The card grid should be grouped by icon the same way `docs/GAME_DESIGN.md` §6.2 already tables the passive cards (and implicitly, the six active icons) — reuse that mental model rather than a flat/sorted list.

</specifics>

<deferred>
## Deferred Ideas

- **Multiple named/saved loadouts (deck manager)** — deferred by D-01; if playtesting shows players want to keep several builds around, this becomes its own future phase with a storage migration.
- **DECK-06 archetype-aware hints** (e.g. flagging an active/passive imbalance in prose) — explicitly not in this phase's requirement list per REQUIREMENTS.md; noted for a later polish phase.
- **In-lobby "editing loadout" indicator for other players** — D-05 only reuses the existing ready-state broadcast; a dedicated "Player X is editing their loadout" signal was not requested and is left for later if it turns out to matter.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope.

</deferred>

---

*Phase: 2-Deckbuilder & Persistent Loadouts*
*Context gathered: 2026-08-27*
