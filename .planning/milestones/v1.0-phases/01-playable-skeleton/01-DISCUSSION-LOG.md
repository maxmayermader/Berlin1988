# Phase 1: Playable Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 1-Playable Skeleton
**Areas discussed:** Default loadout & agent count, Map & round timer, Resolution step-through UX, AI auto-fill & PartyKit hosting, Player identity, Styling baseline, Refresh/disconnect behavior

---

## Default Loadout & Agent Count

| Option | Description | Selected |
|--------|-------------|----------|
| Phantom | Stealth/evasion-leaning starter preset | ✓ |
| Hunter | Aggression/strike-leaning starter preset | |
| You decide | Claude picks simplest to validate first | |

| Option | Description | Selected |
|--------|-------------|----------|
| 2 agents (Recommended) | Matches design doc's FFA recommendation, avoids early-elimination boredom | |
| 1 agent | Simpler to build, reintroduces early-elimination risk with no toggle | ✓ |

**User's choice:** Phantom preset, 1 agent per player.
**Notes:** Flagged the tradeoff — 1 agent means an eliminated player is benched for the rest of a 14-round match with no host toggle to switch to 2 agents in Phase 1. User accepted this tradeoff for scope simplicity. Spectator-seat concept from the design doc is expected to absorb the gap without further Phase 1 decisions.

---

## Map & Round Timer

| Option | Description | Selected |
|--------|-------------|----------|
| Smallest available (Recommended) | Simplest board to render/playtest first | ✓ |
| Mid-size (~14-15 nodes) | Closer to real 3-4p feel, more complexity | |
| Largest (18 nodes) | Full design-doc map, most complexity | |

| Option | Description | Selected |
|--------|-------------|----------|
| 60 seconds (Recommended) | Matches CONCERNS.md's assumed default | |
| 90 seconds | More breathing room for humans; CONCERNS.md floats this as a fallback | ✓ |
| You decide | Claude picks 60s, adjustable later | |

**User's choice:** Smallest map (currently only `duel12`, 12 nodes, is implemented). 90-second round timer.
**Notes:** Whether `duel12` (documented in-code as "the solo and 1v1 map") needs adaptation for 3-4 players was not resolved here — left to research/planning.

---

## Resolution Step-Through UX

| Option | Description | Selected |
|--------|-------------|----------|
| Click-to-advance (Recommended) | Player-paced, simplest to build/test for fog-safety | ✓ |
| Auto-advance with delay | Broadcast-reveal feel, adds timing/pause logic | |

| Option | Description | Selected |
|--------|-------------|----------|
| Instant snap (Recommended) | Simplest, matches minimal-styling framing | |
| Simple slide/fade | Short CSS transition per step, small added cost | ✓ |

**User's choice:** Click-to-advance report, with a simple slide/fade transition per step.
**Notes:** None.

---

## AI Auto-Fill & PartyKit Hosting

| Option | Description | Selected |
|--------|-------------|----------|
| Random personality, fixed mid difficulty (Recommended) | Varied but sidesteps Katja's documented duel dominance | ✓ |
| Lowest difficulty tier, random personality | Friendliest for a first pass | |
| You decide | Claude picks simplest fixed pairing | |

| Option | Description | Selected |
|--------|-------------|----------|
| Leave to research (Recommended) | No infra preference; researcher investigates PartyKit hosts | (superseded, see below) |
| I have a preference | User specifies now | |

**User's choice (AI fill):** Random personality, fixed mid-tier difficulty.
**User's initial answer (hosting):** "Leave to research but could I do everything on vercel. Use webhooks and reddis. Vercel has webhooks" — this combined "leave to research" with a specific idea (all-Vercel + webhooks + Redis).
**Clarification:** Claude corrected that webhooks are server-to-server callbacks, not a mechanism for live client push (round timer, submission count) — the real alternative is WebSockets/SSE, not webhooks.

### Follow-up: Hosting architecture direction

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on PartyKit, research only where it deploys (Recommended) | PartyKit already locked in docs/ARCHITECTURE.md; smaller rework | |
| Have research compare PartyKit vs. all-Vercel (Redis + WebSockets/SSE) | Treats "one platform" as worth the architecture risk; researcher produces a real comparison | ✓ |

**User's choice:** Have the Phase 1 researcher genuinely compare PartyKit vs. an all-Vercel (Redis + WebSockets/SSE) architecture, rather than only researching PartyKit's deploy target. Not pre-decided — planner must get an explicit decision from the comparison.
**Notes:** This overrides the "PartyKit is locked" framing in existing docs for the purposes of Phase 1 research scope; recorded as a one-way-reversibility decision in CONTEXT.md (D-08) because whichever transport ships is what every later phase builds against.

---

## Player Identity

| Option | Description | Selected |
|--------|-------------|----------|
| Name text field on home page (Recommended) | Player types display name, saved to local storage | |
| Auto-generated name | Random codename, no input required | ✓ (modified) |

**User's choice:** "Auto generate spy handler name which can be changed before the game starts."
**Notes:** Combined both options — auto-generated codename by default, editable before match start (in lobby, pre-ready). Captured as D-09.

---

## Styling Baseline

| Option | Description | Selected |
|--------|-------------|----------|
| Clean but plain (Recommended) | Basic Tailwind layout, readable, no theme/animation | ✓ |
| Raw/unstyled | Default browser styling, fastest but hard to playtest | |

**User's choice:** Clean but plain.
**Notes:** None.

---

## Refresh / Disconnect Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| No reconnection — out of scope (Recommended) | Matches roadmap: LOBBY-06 is Phase 3 scope | ✓ |
| Basic reconnect to current state | More robust, adds session/rejoin logic ahead of schedule | |

**User's choice:** No reconnection handling in Phase 1 — accepted as a known gap.
**Notes:** None.

---

## Claude's Discretion

None — every gray area reached an explicit user decision.

## Deferred Ideas

- Host-configurable agent count (1 vs 2 agents) — revisit if playtesting shows early elimination hurts retention.
- Spectator-seat behavior for eliminated players — expected to be covered by the existing design-doc concept, not re-scoped here.
- Reconnection/drop resilience — Phase 3 (LOBBY-06).
- Full retro CRT/teletype theming — v2 (THEME-01).
