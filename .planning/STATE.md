---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Awaiting next milestone
stopped_at: Phase 4 UI-SPEC approved
last_updated: "2026-09-14T21:47:59.284Z"
last_activity: 2026-09-14
last_activity_desc: Milestone v1.0 completed and archived
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 18
  completed_plans: 18
current_phase: 1
current_phase_name: Playable Skeleton
---

# Project State

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-09-14:

| Category | Item | Status |
|----------|------|--------|
| uat_gap | Phase 01 — 01-UAT.md | testing (2 pending scenarios) |
| uat_gap | Phase 02 — 02-UAT.md | testing (1 pending scenario) |
| verification_gap | Phase 01 — 01-VERIFICATION.md | human_needed |
| verification_gap | Phase 02 — 02-VERIFICATION.md | human_needed |

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-18)

**Core value:** A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete, playable 14-round match and see a result — with no gaps in the underlying rules engine.
**Current focus:** Phase 04 — deduction-surfaces-presentation-polish

## Current Position

Phase: Milestone v1.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-09-14 — Milestone v1.0 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 03 | 4 | - | - |
| 04 | 4 | - | - |

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
| Phase 02 P01 | 55min | 2 tasks | 18 files |
| Phase 02 P02 | 35min | 3 tasks | 7 files |
| Phase 02 P03 | 40min | 3 tasks | 2 files |
| Phase 02 P04 | 45min | 3 tasks | 7 files |
| Phase 03 P01 | single session (spanning checkpoint) | 4 tasks | 12 files |
| Phase 03 P03 | 20min | 3 tasks | 26 files |
| Phase 03 P04 | single session, spanning one checkpoint | 4 tasks | 20 files |

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
- [Phase 02-01]: SUBMIT_LOADOUT/LOADOUT_ACK/LOADOUT_REJECTED added to the wire protocol, modelled directly on the existing SUBMIT_ORDER/ORDER_ACK/ORDER_REJECTED triad — no identity field on the inbound message, seat always resolved via seatFor(connectionId).
- [Phase 02-01]: RoomSeat.loadout is server-only and never enters toSnapshot()/LobbySeat — a loadout is hidden pre-match information under docs/GAME_DESIGN.md §6.3, not public lobby state.
- [Phase 02-01]: startMatch re-validates a seat's stored loadout against validateLoadout() a second time (defence in depth beyond the handler's own check) and falls back to PHANTOM if it no longer validates; bot seats are never routed through the human SUBMIT_LOADOUT path and keep createMatch's own per-faction starter loadout.
- [Phase 02-01]: apps/web/lib/loadoutStore.ts mirrors identity.ts's SSR-safe hydration pattern exactly — hydrate() is called from a mount effect, never inside the Zustand create() initializer, to avoid a Next.js server-render-time localStorage read.
- [Phase 02-02]: loadoutLegality() is a pure exported function (never store state or a hook) that calls validateLoadout()/budgetPointsOf() and computes no rule of its own — recomputed every render, mirroring how OrderComposer.tsx calls legalOrders() live rather than caching a derived set.
- [Phase 02-02]: violatingCardIds is attribution, not a second rules engine — gated on the engine having already reported ICON_LIMIT/UNKNOWN_CARD for the exact draft, so it can never flag a tile in a draft validateLoadout() considers legal.
- [Phase 02-02]: No sector in the current 34-card pool reaches ten cards (richest is nine) — a same-sector legality test fixture must pad to size with a repeated card id, which validateLoadout() tolerates since it has no duplicate-id rule.
- [Phase 02-03]: No production code changes needed — Plan 02-01's handleSubmitLoadout/setLoadout/startMatch already satisfy the full adversarial loadout contract (cross-seat isolation, all five violation codes, every phase guard, wire-level fog scan)
- [Phase ?]: 02-04: Task 1's tracer implemented the full in-lobby editor feature set in one pass; Tasks 2/3 became characterization coverage, consistent with 02-02/02-03 precedent.
- [Phase ?]: 02-04: A refused-save-keeps-editor-open behavior is implemented but not automatable (D-03's client gate makes an illegal SUBMIT_LOADOUT unreachable via UI); recorded as human_judgment in coverage.
- [Phase ?]: 03-01: Directory entries keyed by room code (not host codename) so two lobbies with the same host codename never collide
- [Phase ?]: 03-01: pushDirectory() called from every seat/phase-affecting room.ts branch, plus unconditionally at SUBMIT_ORDER's tail as a self-heal for room.context.parties being unreliable inside onAlarm
- [Phase ?]: 03-01: A BOT seat counts as filled for seatsFilled since a bot-auto-filled lobby is genuinely not joinable
- [Phase ?]: 03-01: directorySocket.ts never clears lobbies on socket close — a directory-party outage degrades to stale-but-visible rows rather than a broken home page
- [Phase ?]: 03-01: directoryEntrySchema/directoryCommandSchema built with z.strictObject to structurally enforce prohibition P-3-01 (no field beyond the four D-02 fields can reach the wire)
- [Phase ?]: 03-03: CHAT_SEND's text/promptId exclusivity enforced via .superRefine() on the whole discriminatedUnion (a second CHAT_SEND member can't coexist under the same discriminator key)
- [Phase ?]: 03-03: chatMessageSchema and the CHAT_SEND client member are both z.strictObject — structural enforcement of P-3-02's payload half and T-03-15, beyond a plain z.object
- [Phase ?]: 03-03: sendChatHistory is a targeted sendTo, deliberately not folded into sendChat's room-wide fan-out — it carries data every connection already has, so no per-recipient variation of the kind P-3-02 forbids
- [Phase ?]: 03-03: ChatComposer extracted as its own exported sub-component from ChatPanel.tsx so the flavor-prompt picker and composer markup are never duplicated between the lobby and match chat surfaces
- [Phase ?]: 03-04: personality.title already existed in packages/ai (03-RESEARCH.md Pitfall 4 correct, 03-CONTEXT.md D-09 stale) — no title lookup was added
- [Phase ?]: 03-04: RoomSeat.controlledBy split from kind — kind is origin (never changes), controlledBy is current driver (flips HUMAN<->AI both ways)
- [Phase ?]: 03-04: DISCONNECT_GRACE_MS = 20_000, planner's choice per D-07 — a lower bound on the real reclaim window, not an exact one
- [Phase ?]: 03-04: reclaimSeat purges every queued botSubmissions entry for the reclaimed seat atomically with the control flip, closing the verified submitOrder() overwrite race
- [Phase ?]: [Phase 03-04]: Task 4 checkpoint (cross-browser disconnect/grace-period/AI-takeover/reclaim verification) approved by user across all 12 steps — plan and Phase 3 complete

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
- 03-04 Task 4 (checkpoint:human-verify, gate=blocking): real cross-browser disconnect/grace-period/AI-takeover/reclaim verification required — dev servers already running (web http://localhost:3000, party http://127.0.0.1:1999). See 03-04-PLAN.md Task 4 for the 12-step verification script.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-02T23:21:40.953Z
Stopped at: Phase 4 UI-SPEC approved
Resume file: .planning/phases/04-deduction-surfaces-presentation-polish/04-UI-SPEC.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
