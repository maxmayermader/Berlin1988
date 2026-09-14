# Phase 4: Deduction Surfaces & Presentation Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 4-Deduction Surfaces & Presentation Polish
**Areas discussed:** Round history source, Burn Track scope, Motion approach, Round history detail level, Burn Track gap detail

---

## Round History Source (MATCH-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side full log | GameState grows a roundLog accumulating each round's fog-filtered events; PlayerView carries the whole match history. Survives refresh/reconnect. | ✓ |
| Client-side accumulation | Web app appends each ROUND_RESOLVED payload to a local store as it arrives. Zero server changes but loses history on refresh/reconnect. | |

**User's choice:** Server-side full log (recommended option).
**Notes:** Chosen specifically because it plays correctly with Phase 3's D-08 mid-match AI-takeover/reclaim reconnect flow, which client-only accumulation would break.

---

## Burn Track Scope (MATCH-07)

| Option | Description | Selected |
|--------|-------------|----------|
| UI-only | Data already flows correctly through the engine; this phase just adds a panel component. | |
| Something's missing, let's discuss | User flagged additional scope beyond a plain UI panel. | ✓ |

**User's choice:** Flagged additional scope, then specified in a follow-up question.

### Follow-up: what's missing

| Option | Description | Selected |
|--------|-------------|----------|
| Own-vs-opponents view toggle | Let the player browse opponents' tracks, not just their own. | |
| Cutout redaction display | Panel must correctly render redacted entries (icon only, no color) rather than dumping raw BurnEntry objects. | ✓ |
| Live update animation on new entries | New entries should be visually called out when appended, tying into POLISH-01. | ✓ |
| Something else | | |

**User's choice:** Cutout redaction display + live update animation on new entries.
**Notes:** Own-vs-opponents toggle was raised as an option but not selected — moved to Deferred Ideas since the underlying data is already public/symmetric and this could be cheap to add later or during implementation at planner/executor discretion.

---

## Motion Approach (POLISH-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Extract a shared hook/wrapper | Pull the reduced-motion + transition logic from StepThrough into a shared util so every screen uses one consistent set of durations/easings. | ✓ |
| Repeat the inline pattern per component | Keep following StepThrough's local useReducedMotion() call in each new component individually. | |

**User's choice:** Extract a shared hook/wrapper (recommended option).

---

## Round History Detail Level

| Option | Description | Selected |
|--------|-------------|----------|
| Condensed summary list, expandable to full replay | Default is a scrollable list (one row per round); expanding a row re-renders via the existing StepThrough component. | ✓ |
| Condensed list only | Just one-line summaries, no drill-down. | |
| Full replay list only | Every past round rendered in full StepThrough detail, stacked/paginated. | |

**User's choice:** Condensed summary list, expandable to full replay (recommended option).

---

## Claude's Discretion

- Exact shape/name of the server-side round-log field and how it's threaded through `resolveRound()`.
- Exact wording of round-history summary rows and the Burn Track entry call-out animation's specific easing/duration.
- Whether the shared motion utility is a hook, a wrapper component, or both.

## Deferred Ideas

- Own-vs-opponents Burn Track browsing — data is already public/symmetric per the design doc, so low-cost to add, but not selected as in-scope this discussion. Flagged for planner/executor judgment rather than a hard exclusion.
