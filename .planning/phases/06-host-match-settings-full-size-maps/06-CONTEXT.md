# Phase 6: Host Match Settings & Full-Size Maps - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — recommended answers auto-accepted; user was away. All decisions below are Claude's recommendations grounded in ROADMAP.md phase detail, REQUIREMENTS.md, docs/GAME_DESIGN.md §3.1, and the existing code. Override any of them at plan review.

<domain>
## Phase Boundary

The host shapes the match before it starts — agents per player (1 or 2), round timer, round limit, blockade mode, dossier count — with every value enforced server-side, visible live and read-only to every other player, and any change after ready-up clearing ready state. 3-player matches start on a new 16-node FFA-16 map and 4-player matches on a new 18-node FFA-18 map, selected automatically from seat count; both maps pass a bot-vs-bot sim sweep before humans play them.

In scope: `SET_SETTINGS` wire message + room handler, settings state in the lobby snapshot, host settings UI in the lobby, `buildMatchConfig()` honoring room settings, `ffa16.ts`/`ffa18.ts` map data + `MAPS` registry, `mapId`-from-seat-count rule, `map-invariants` test suite, sim sweep.

Out of scope: the order composer (Phase 7), any new `PlayerView` surface (Phase 8), pause flow, team mode UI, host-picked maps.

</domain>

<decisions>
## Implementation Decisions

### Host Settings Panel (lobby UX)
- Controls live inline in the existing lobby column as a "Match Settings" section, host-editable; follows the existing `SeatCountControl` interaction pattern.
- Non-hosts see the identical section read-only, updating live from lobby snapshots (LOBBY-13).
- When a settings change clears ready state (LOBBY-15), players see an explicit banner ("Host changed settings — ready state cleared") and any start countdown cancels.
- Round timer defaults to 90s (current room behavior), host-adjustable within a shared allowed range (30–180s), with 60s available as a value. Rationale: ROADMAP flags the 4-actions-under-one-clock squeeze with 2 agents; the design doc's 60s is untested for that load. Measure real submission times during verification.

### SET_SETTINGS protocol & validation
- One `SET_SETTINGS` message carrying a partial settings patch; Zod-validated per field at the room boundary like every other inbound message.
- Allowed ranges/enums live in one shared constants table in `packages/shared` (data, not code); the client renders bounds from the same table the server enforces — no duplicated legality logic.
- Server rejects non-host senders and out-of-range values with an ERROR frame naming the offending field (LOBBY-14); the UI also renders controls read-only for non-hosts.
- `SET_SETTINGS` is accepted only in LOBBY phase. Any accepted change clears all ready flags and cancels a running start countdown. Settings are frozen once the LOADOUT transition fires.
- Only fields `createMatch()` demonstrably honors are exposed (ROADMAP "placebo controls" risk): agentsPerPlayer, roundTimerSeconds, roundLimit, blockadeMode, dossierCount. Audit each before exposing; anything unhonored stays out of the UI.

### FFA-16 / FFA-18 maps
- Hand-authored Berlin node graphs as content data files mirroring `duel12.ts` structure. Targets from GAME_DESIGN §3.1: FFA-16 = 16 nodes, avg degree ~3.0, 4 U-Bahn stations; FFA-18 = 18 nodes, avg degree ~3.2, 5 U-Bahn stations. Real Berlin place names, all four sectors represented, street/tunnel/checkpoint edge types per §3.1.
- Map selection is automatic from seat count (MAP-03): 1–2 players Duel-12, 3 FFA-16, 4 FFA-18. The chosen map shows read-only in the settings panel; no host map picker this phase.
- Dossier count default is per-map (tuned via sim sweep), host-overridable within the shared allowed range.
- Acceptance gate: a `map-invariants` Vitest suite (node/edge/degree/U-Bahn/sector/extraction structural checks for every MAPS entry) plus a sim sweep per new map — no crashes over the sweep, no personality >80% win rate in a mixed field, dossier count tuned for player count (MAP-04). Existing golden fixtures stay pinned to duel-12 and must not churn.

### Claude's Discretion
- Exact node names/positions/edges of the new maps (within §3.1 targets and sim gate).
- Exact copy for banners and labels.
- Whether blockadeMode exposes all four values (off/announced/random/mixed) directly or via labeled presets, provided the server validates the enum.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/party/src/settings.ts` — `buildMatchConfig()` is the single `createMatch()` call site; today hardcodes `agentsPerPlayer: 1`, `mapId: 'duel-12'`, `roundTimerSeconds: 90`, `roundLimit: 14`, `dossierCount: 2`, `blockadeMode: 'MIXED'`. This is where room settings must flow in.
- `packages/shared/src/settings.ts` — `MatchSettings` interface already models every field; `packages/engine` `quickSettings()` is the test-helper reference.
- `apps/web/components/lobby/SeatCountControl.tsx` — the existing host-only lobby control; its pattern (host-editable, others read-only, server-validated) extends to the settings panel.
- `packages/engine/src/content/maps/duel12.ts` — the map data file shape to mirror; `MAPS` registry in content.
- `packages/ai/sim/run.ts` — the sim harness for the sweep (`pnpm sim --matches 300 --profile`).
- `packages/ai/tests/validation.test.ts` + `packages/engine/tests/soak.test.ts` — existing thresholds to model the map sim gate on.

### Established Patterns
- All inbound room messages Zod-validated at the boundary (`apps/party/src/handlers.ts`).
- Host-only actions already exist (seat count, kick) — reuse the same authorization check.
- Golden fixtures pinned to duel-12 via `quickSettings()`; regenerate only on intentional rules change.
- Style through tokens, not hex (ROADMAP standing convention for Phases 6–9).

### Integration Points
- `packages/shared/src/protocol.ts` — add `SET_SETTINGS` (documented in docs/ARCHITECTURE.md §5 and apps/party/src/CLAUDE.md as if shipped; actually absent).
- `apps/party/src/handlers.ts` — handler + host check + range validation + ready-clear.
- `apps/party/src/state.ts` — room state must carry current lobby settings; lobby snapshot broadcasts them.
- `apps/web/app/lobby/[code]/page.tsx` — mount the settings panel.
- `packages/engine/src/content/` — new map files + registry entries; `buildMatchConfig()` maps seat count → mapId.

</code_context>

<specifics>
## Specific Ideas

- ROADMAP "Below the UI" note is the implementation map: only "host sets it → buildMatchConfig()" wiring is missing; createMatch, bots and sim already honor every MatchSettings field.
- Settings track and maps track share no files — plan them as parallel worktree plans (ROADMAP parallelization note).
- Worktree base refs (`worktree.baseRef: "head"`) set at phase start — v1.0 lost a respawn cycle to fork-base drift.

</specifics>

<deferred>
## Deferred Ideas

- Host-picked maps (map picker UI) — automatic selection only this phase.
- Team mode (2v2) settings — `teams` stays false.
- Pause flow (`pausesPerPlayer`) — no pause this milestone phase.
- Staging PartyKit host (DEPLOY-05) — already deferred at milestone level.

</deferred>
