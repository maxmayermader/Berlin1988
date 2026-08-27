---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
current_phase_name: Playable Skeleton
status: deferred
stopped_at: Phase 01 verified human_needed (6/7 must-haves, 5/5 roadmap Success Criteria); Task 3's deployed-hibernation + human-playtest checkpoint explicitly deferred by user decision, tracked in 01-UAT.md
last_updated: "2026-08-27T20:04:52.734Z"
last_activity: 2026-08-27
last_activity_desc: Phase 01 verification complete (human_needed, 6/7); Vercel-deployment checkpoint deferred by explicit user choice; proceeding to Phase 2 planning
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 6
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-18)

**Core value:** A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete, playable 14-round match and see a result — with no gaps in the underlying rules engine.
**Current focus:** Phase 01 — Playable Skeleton

## Current Position

Phase: 01 (Playable Skeleton) — DEFERRED (human_needed, 6/7 must-haves; all 5 roadmap Success Criteria verified)
Plan: 6 of 6 — all plans summarized; Task 3's deployed-hibernation + human-playtest checkpoint tracked as pending UAT, not blocking
Status: deferred
Last activity: 2026-08-27 — Phase 01 verified human_needed; Vercel-deployment checkpoint deferred by user; proceeding to Phase 2 planning

Progress: [████████░░] 83%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 55min | 3 tasks | 37 files |
| Phase 01 P02 | 25min | 3 tasks | 17 files |
| Phase 01 P03 | unknown | 3 tasks | 16 files |
| Phase 01 P04 | unknown (interrupted, resumed) | 3 tasks | 17 files |
| Phase 01 P05 | 55min | 3 tasks | 15 files |
| Phase 01 P06 | 45min | 2 tasks | 18 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Walking-skeleton-first ordering — Phase 1 delivers a genuinely playable end-to-end match (bare lobby, one default loadout, minimal styling) before deckbuilder, lobby browser, chat, Burn Track, or polish are built.
- [Roadmap]: Vertical MVP mode — every phase ends in something playable, not a completed technical layer.
- [Roadmap]: Research's 9-phase suggestion compressed to 4; its highest-risk items (4-player timing, wire-level fog of war, resolution timing, hibernation) are pulled forward into Phase 1 as explicit research flags rather than deferred to late phases.
- [PROJECT.md]: Deck editing in-lobby and the home deckbuilder are the same loadout system.
- [PROJECT.md]: No accounts for v1 — player name and decks persist via browser local storage.
- [Phase ?]: Join codes ARE PartyKit room ids, minted via a stateless _new HTTP endpoint before any WebSocket connects — resolves the create-a-room-with-a-server-chosen-id addressing problem without cross-room fetch.
- [Phase ?]: Token-based seat rebind: the home page's create/join handshake connection is transient; the lobby route's own persistent connection rebinds to the same seat via JOIN's optional token field.
- [Phase ?]: Custom Tailwind v4 @theme tokens must avoid Tailwind's own reserved named-scale keys (xs/sm/md/lg/xl/2xl/3xl under --spacing-*) — they silently override built-in utilities like max-w-xl.
- [Phase ?]: 10-second ready-countdown duration is the planner's choice — no source artifact specifies one (LOBBY-04 unresolved edge)
- [Phase ?]: Bot difficulty fixed at HANDLER for all of Phase 1 (D-07) — no difficulty UI, avoids a trivially-easy first opponent
- [Phase ?]: startMatch is idempotent (returns state unchanged outside LOBBY/LOADOUT) — the safety net against a double-fired room alarm
- [Phase ?]: ROUND_RESOLVED carries only { view } — resolveRound()'s raw ResolutionEvent[] log is never a wire field, since PlayerView.lastRound is already fog-filtered
- [Phase ?]: RETRACT_ORDER is not built in Phase 1 (source conflict, resolved) — deferred to Plan 01-04's order composer; MATCH-04's monotonic commit-count guarantee is honoured instead
- [Phase ?]: A RoomState mutation from the alarm handler is only re-broadcast when reference-distinct from the input — prevents duplicate ROUND_RESOLVED/CLOCK frames on a stale or duplicate alarm fire
- [Phase ?]: Board's initial/re-anchored keyboard focus comes from the active agent's real node (selectedNodeId), not map.nodes[0] — fixes an arrow-key-navigation bug found via the plan's own keyboard E2E case
- [Phase ?]: orderDraft.test.ts's createMatch/projectView imports are a deliberate, plan-directed, test-only exception to the 'no authoritative engine import in apps/web' gate — never ships in the browser bundle
- [Phase ?]: Report's resolved round number is read from the log's own ROUND_START event, not view.round, since resolveRound's upkeep already advances the round counter before the client sees the log.
- [Phase ?]: SubmittedCount/LockedInRow take a PlayerView prop but read matchStore.committed internally, closing off any path for a caller to pass a locally-adjusted count.
- [Phase ?]: Static-source vitest assertions (reading component source for useReducedMotion, #2563EB, truncateCodename) served as genuine RED-before-GREEN TDD for UI-only conventions with no component-test stack this phase.
- [Phase ?]: SelfView.score added as a deliberate exception to 'no engine changes expected' this phase — closes a fog-of-war asymmetry rather than recomputing score in the browser
- [Phase ?]: 01-06 Task 3 (deployed hibernation + full-match human checkpoint) is blocked: no Vercel deployment of apps/web exists in this environment (no CLI, no linked project) — user must deploy and set NEXT_PUBLIC_PARTYKIT_HOST before Task 3 can be attempted

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- **PartyKit hosting location undecided** (PROJECT.md constraint) — must be resolved during Phase 1; `apps/web` is settled on Vercel.
- **Untested real-time timing at n=4** (CONCERNS.md, research gap 1) — the critical unknown; Phase 1 planning should include a 4-bot live-room measurement.
- **Wire-level fog-of-war leakage** (research pitfall 1) — `PlayerView` type-safety is not wire-safety; per-connection `projectView()` and a byte-level integration test are required in Phase 1.
- **REQUIREMENTS.md coverage count was stale** — header said 26 v1 requirements; actual count is 28. Corrected during roadmap creation.
- ~~PartyKit CLI not authorised against a Cloudflare account~~ — RESOLVED 2026-08-27: user completed `pnpm --filter party exec partykit login`; `partykit deploy` ran and the deployed room was verified live.
- 01-06 Task 3 phase-gate checkpoint cannot start: apps/web has no Vercel deployment in this environment (no `vercel` CLI, no linked `.vercel/` project, no `gh` CLI to check GitHub-integration auto-deploy). apps/party IS deployed and verified live at https://berlin1988-party.maxmayermader.partykit.dev (confirmed via `POST /parties/match/_new` -> `{"code":"F233NQ"}`). User must deploy apps/web to Vercel, set `NEXT_PUBLIC_PARTYKIT_HOST` to `berlin1988-party.maxmayermader.partykit.dev`, then run Task 3's manual verification steps A and B from 01-06-PLAN.md.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-27T19:27:21.915Z
Stopped at: 01-06 Tasks 1-2 complete (deploy verified live); Task 3 checkpoint blocked on missing Vercel deployment of apps/web
Resume file: .planning/phases/01-playable-skeleton/01-06-PLAN.md
