# Phase 4: Deduction Surfaces & Presentation Polish - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Players can reason about what has been revealed across the whole match, and the app stops looking like a prototype. This phase adds a round history/log panel (re-read every past resolution in the current match), a Burn Track panel (a player's own public "capability profile" as opponents see it), and consistent motion polish (transitions, hover states, card flips, button/loading feedback) across home, deckbuilder, lobby, and match screens, respecting `prefers-reduced-motion`. No rebalancing, no new gameplay mechanics, no engine/protocol redesign beyond what round history requires.

Requirements covered: MATCH-06, MATCH-07, POLISH-01.

</domain>

<decisions>
## Implementation Decisions

### Round History (MATCH-06)
- **D-01:** Round history is a server-side full match log, not client-side accumulation. `GameState` gains a persisted per-round log (in the spirit of the existing `lastRoundLog: ResolutionEvent[]` field at `packages/shared/src/state.ts:120`, but retained across all rounds instead of overwritten each round) and `PlayerView` carries the full fog-filtered history, not just `lastRound`. — **Reversibility:** costly — this is a `GameState`/`PlayerView` shape change touching `createMatch.ts`, the resolution pipeline, and `projectView.ts`; switching to client-only accumulation later would mean removing the field and rebuilding trust in client-side persistence instead.
- **D-02:** Round history survives refresh and mid-match reconnect (including Phase 3's D-08 AI-takeover-and-reclaim flow) because it lives on the server and is delivered via `PlayerView`, not accumulated client-side from live socket events.
- **D-03:** History UI is a condensed one-line-per-round summary list by default (round #, headline outcome), each row expandable to a full replay using the existing `StepThrough` component (`apps/web/components/resolution/StepThrough.tsx`) rather than building a second renderer.

### Burn Track (MATCH-07)
- **D-04:** `PlayerView.burnTracks` already exists and is fully populated by the engine (`createMatch.ts`, `ctx.ts`'s `appendBurn`, `projectView.ts`) — this phase adds a UI panel over existing data, not new engine/protocol work.
- **D-05:** Cutout redaction (`sector: null` on a `BurnEntry`, applied once server-side at append time per `ctx.ts:113-119`) must render correctly in the panel: icon-only display with no color/sector indicator for redacted entries, not a raw dump of the entry object. The panel does not re-derive redaction — it trusts `sector === null` as the signal.
- **D-06:** New Burn Track entries get a call-out animation when they're appended after a round resolves — ties into the POLISH-01 motion work below, not a separate animation system.
- **D-07 (deferred from a broader ask):** The panel shows only the viewing player's own Burn Track this phase — an own-vs-opponents toggle/browser for other players' tracks was raised but not selected as in-scope; see Deferred Ideas.

### Motion Polish (POLISH-01)
- **D-08:** Extract a shared motion utility (e.g. `apps/web/lib/motion.ts` and/or a small wrapper component) from the pattern already established in `StepThrough.tsx` (`motion`/`useReducedMotion` from the `motion` package, already a dependency) rather than repeating the inline `useReducedMotion()` call per new component. Every new transition/hover/card-flip/loading treatment across home, deckbuilder, lobby, and match screens should route through this shared utility so durations/easings stay consistent and `prefers-reduced-motion` handling isn't duplicated per component. — **Reversibility:** reversible — this is additive extraction from existing working code; components can still call `motion`/`useReducedMotion` directly if the shared utility doesn't fit a case.

### Claude's Discretion
- Exact shape/name of the server-side round-log field and how it's threaded through `resolveRound()` (D-01) — planner/researcher to size against the existing `lastRoundLog` pattern.
- Exact wording of round-history summary rows (D-03) and the Burn Track entry call-out animation's specific easing/duration (D-06) — implementer's call within the shared motion utility (D-08).
- Whether the shared motion utility (D-08) is a hook, a wrapper component, or both — planner's call based on what StepThrough's existing usage suggests generalizes cleanly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Round History / Resolution State
- `packages/shared/src/state.ts:120` — `lastRoundLog: ResolutionEvent[]`, the field D-01's persisted history builds on
- `packages/shared/src/view.ts:135` — `lastRound: readonly ResolutionEvent[]` on `PlayerView`, the field D-01 extends to a full-match log
- `packages/engine/src/fog/projectView.ts` — `filterEvents(state, state.lastRoundLog, viewer)` (line 115), the fog-filtering chokepoint any new history field must also pass through
- `apps/party/src/broadcast.ts` — `sendResolved()`, the `ROUND_RESOLVED` per-connection `projectView()` dispatch; comment there ("resolveRound()'s raw ResolutionEvent[] log is not a parameter... and is never in scope") documents the existing fog discipline this phase must preserve for the new history field
- `apps/web/components/resolution/StepThrough.tsx` — the step-through renderer D-03 reuses for per-round expansion; also the source of the `motion`/`useReducedMotion` pattern D-08 extracts

### Burn Track
- `packages/shared/src/state.ts:71-79` — `BurnEntry` interface (`sector: Sector | null`, null = Cutout-redacted)
- `packages/engine/src/resolution/ctx.ts:94-119` — `playCard()`/`appendBurn()`, where Cutout redaction is applied once at append time
- `packages/shared/src/view.ts:133` — `PlayerView.burnTracks: Readonly<Record<string, readonly BurnEntry[]>>`, already includes the viewer's own track (symmetric by design, `docs/ARCHITECTURE.md` §4.2)
- `docs/GAME_DESIGN.md` §6.3 "The Burn Track — public information about capability" — design intent: "You can always see your own Burn Track exactly as opponents see it," a capability profile not an exhaustion counter
- `docs/ARCHITECTURE.md` §4.2 "Symmetric Burn Tracks" — why there's no owner-only variant to keep in sync

### Motion / Accessibility
- `apps/web/components/resolution/StepThrough.tsx` — existing `motion`/`useReducedMotion` usage (from the `motion` npm package, already a dependency per `apps/web/package.json`) that D-08's shared utility generalizes
- `apps/web/CLAUDE.md` — "Motion respects `prefers-reduced-motion`" accessibility rule (rule 4), applies to all new motion work this phase
- `apps/web/components/board/CLAUDE.md` — rule 4 referenced by StepThrough's inline comments on reduced-motion behavior (flash-then-settle under reduced motion)

### Prior Phase Decisions
- `.planning/phases/03-open-lobbies-host-control-table-talk/03-CONTEXT.md` D-08 — mid-match AI-takeover-and-reclaim; D-02 above (round history surviving reconnect) depends on this being handled correctly by the server-side log approach
- `.planning/phases/01-playable-skeleton/01-CONTEXT.md` — MATCH-05 step-through resolution precedent (fixed priority order, sequential reveal) that D-03's expandable replay must not violate

### Requirements Traceability
- `.planning/REQUIREMENTS.md` — MATCH-06, MATCH-07, POLISH-01 (this phase)
- `.planning/ROADMAP.md` "Phase 4" section — goal statement and success criteria this phase must satisfy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/state.ts`'s `lastRoundLog` field and `apps/party/src/broadcast.ts`'s `sendResolved()` per-connection `projectView()` dispatch are the direct template for D-01's full-history field — same fog-filtering discipline, just retained across rounds instead of overwritten
- `apps/web/components/resolution/StepThrough.tsx` is reused twice this phase: as the drill-down renderer for round history (D-03) and as the source pattern for the shared motion utility (D-08)
- `PlayerView.burnTracks` (already wired end-to-end: `createMatch.ts` → `ctx.ts` → `projectView.ts` → `view.ts`) needs zero engine changes for D-04 — pure UI work

### Established Patterns
- Fog-filtering chokepoint: every player-visible field derived from `GameState` passes through `projectView()` (`filterEvents` for events, direct copy for `burnTracks` since it's already symmetric-public) — any new history field must follow this same discipline, never bypass it
- `motion`/`useReducedMotion` from the `motion` package (13.1.0, already a dependency) is the established animation primitive — no new animation library needed for POLISH-01

### Integration Points
- `packages/engine/src/resolution/index.ts`'s `resolveRound()` needs to append to the new persisted history field (D-01) in addition to (or instead of) overwriting `lastRoundLog`
- A new history panel component in `apps/web/components/` (naming/placement is planner's call) reads the new `PlayerView` history field and reuses `StepThrough` for expansion
- A new Burn Track panel component reads `view.burnTracks[ownPlayerId]`, handles `sector === null` redaction display (D-05), and hooks into the shared motion utility for entry call-outs (D-06)
- `apps/web/lib/` (per its `CLAUDE.md`) is the natural home for the shared motion utility (D-08) — client-side plumbing that isn't a component

</code_context>

<specifics>
## Specific Ideas

- Burn Track redaction must render as "icon-only display with no color/sector indicator," matching the design doc's Cutout description exactly, not a generic "redacted" placeholder (D-05).
- Round history rows should be condensed (round # + headline outcome) with click-to-expand into the existing StepThrough component, not two separate history views maintained in parallel (D-03).

</specifics>

<deferred>
## Deferred Ideas

- **Own-vs-opponents Burn Track browsing** — the panel could let a player inspect any opponent's Burn Track (all tracks are already symmetric/public per `docs/ARCHITECTURE.md` §4.2, so this would be low-cost to add), but was not selected as in-scope for this phase's discussion (D-07). Worth considering as a small follow-up or as part of this phase's implementation if time allows, since the data is already public and available — flagging for planner/executor judgment rather than a hard exclusion.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope.

</deferred>

---

*Phase: 4-Deduction Surfaces & Presentation Polish*
*Context gathered: 2026-09-02*
