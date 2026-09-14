# Phase 2: Deckbuilder & Persistent Loadouts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-27
**Phase:** 2-Deckbuilder & Persistent Loadouts
**Areas discussed:** Saved loadout model, Illegal-state handling, Card browsing layout, In-lobby edit behavior

---

## Saved Loadout Model

| Option | Description | Selected |
|--------|-------------|----------|
| One active loadout | Player has exactly one loadout at a time; editing overwrites it directly. | ✓ (with clarification below) |
| Multiple named loadouts | Player saves several named loadouts and switches between them for a match. | |

**User's choice:** Free-text first: "4 default loadouts and user can switch out cards before game starts." Follow-up clarified this means: pick one of the four starter presets as a seed, customize it, and that becomes the one persistent loadout — not four independently-saved slots.

**Follow-up: Save shape**

| Option | Description | Selected |
|--------|-------------|----------|
| One persistent loadout | Seeded from a preset, freely edited, overwritten in place. No separate slots. | ✓ |
| 4 independently-saved presets | Each starter preset keeps its own separately-editable saved slot, switchable pre-match. | |

**Notes:** Confirms the single-slot `localStorage` model — loading a different preset later is a reset action (overwrite), not a slot switch.

---

## Illegal-State Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Allow it, flag red | Any edit is always allowed; legality meter turns red and names the violation; save/submit disabled until legal. | ✓ |
| Hard-block the action | Adding/removing that would break a rule is simply prevented; loadout always legal by construction. | |

**User's choice:** Allow it, flag red (the recommended option).
**Notes:** Matches DECK-02's framing of a live meter, not a submit-time pass/fail gate.

---

## Card Browsing Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Grid grouped by icon | Cards grouped/sectioned by icon (Decoy, Wiretap, Strike, Bribe, Safehouse, Agent), passives in their own section. | ✓ |
| Single list, color-coded | One flat, sortable/filterable list of all 16 cards. | |

**User's choice:** Grid grouped by icon.
**Notes:** Mirrors how `docs/GAME_DESIGN.md` §6.2 already tables the card pool.

---

## In-Lobby Edit Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Editing clears ready state | Opening the deckbuilder in-lobby un-readies the player; must re-confirm after closing. | ✓ |
| No interaction with ready state | Editing and readying are fully independent; match can start mid-edit. | |

**User's choice:** Editing clears ready state.
**Notes:** Reuses the existing Phase 1 ready-state broadcast; prevents a countdown starting on an unsaved edit.

---

## Claude's Discretion

- Exact visual placement/styling of the legality meter within the deckbuilder layout.
- Whether an individual rule-violating card gets its own inline highlight versus only surfacing in the meter.

## Deferred Ideas

- Multiple named/saved loadouts (deck manager) — deferred; single-loadout model chosen instead.
- DECK-06 archetype-aware hints — not in this phase's requirement list, left for a later polish phase.
- A dedicated "Player X is editing their loadout" indicator for other lobby seats — not requested; existing ready-state broadcast covers it for now.
