# Phase 3: Open Lobbies, Host Control & Table Talk - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 3-Open Lobbies, Host Control & Table Talk
**Areas discussed:** Public lobby discovery, Host seat-count & kick control, Disconnect/AI takeover & bot readout, Chat design

---

## Public Lobby Discovery

| Option | Description | Selected |
|--------|-------------|----------|
| Directory room | A single well-known PartyKit room every match room registers/unregisters with; home page connects for a live list | ✓ |
| Party's own room listing | Use PartyKit platform APIs to enumerate active rooms by prefix | |
| Polling via server route | Next.js API route periodically fetches known room codes and queries each | |

**User's choice:** Directory room
**Notes:** Chosen for staying inside PartyKit with no new infra, despite being a single sync point.

| Metadata question | Description | Selected |
|--------|-------------|----------|
| Seat count (X/Y filled) | Core to deciding whether to join | ✓ |
| Host codename | Shows who's hosting | ✓ |
| Ready count | How many seated players are readied | |

**User's choice:** Seat count + host codename (multiSelect)

| Visibility question | Description | Selected |
|--------|-------------|----------|
| Hide once match starts | Once phase leaves LOBBY/LOADOUT, no longer joinable | ✓ |
| Hide only when full or ended | Keep visible through match as "in progress" | |

**User's choice:** Hide once match starts

---

## Host Seat-Count & Kick Control

| Seat count question | Description | Selected |
|--------|-------------|----------|
| 2, 3, or 4 | Matches stated 1-4 player range minus solo | |
| Free 1-4 | Also allow explicit solo pre-start | ✓ |

**User's choice:** Free 1–4

| Shrink question | Description | Selected |
|--------|-------------|----------|
| Block the change | Host can't set seat count below occupied count | ✓ |
| Kick the extra players | Lowering count auto-kicks highest-indexed seats | |

**User's choice:** Block the change

| Kick UX question | Description | Selected |
|--------|-------------|----------|
| Redirect home + toast | KICKED message, home redirect, can rejoin with code | ✓ |
| Redirect home, no rejoin | Same but blocked from rejoining that room code | |

**User's choice:** Redirect home + toast

---

## Disconnect, AI Takeover & Bot Readout

| Detection question | Description | Selected |
|--------|-------------|----------|
| PartyKit onClose + grace timer | Grace period allows reconnect via token rebind before AI takes over | ✓ |
| Immediate takeover on close | AI takes seat the instant onClose fires | |

**User's choice:** onClose + grace timer

| Reclaim question | Description | Selected |
|--------|-------------|----------|
| No — permanent once AI takes over | Simplest state machine | |
| Yes, human can reclaim via token | Original player can retake seat from bot later | ✓ |

**User's choice:** Yes, human can reclaim by rejoining with their token
**Notes:** Deliberate divergence from Phase 1 D-11 (no reconnection handling) and from `fillEmptySeatsWithBots`'s current one-way LOBBY-only semantics — flagged as costly/one-way-adjacent work in CONTEXT.md.

| Bot readout question | Description | Selected |
|--------|-------------|----------|
| "[Personality] — AI" badge | Personality name + small AI tag, no difficulty | |
| "[Personality] the [Title]" flavor text | Thematic readout using docs-sourced titles | ✓ |

**User's choice:** "[Personality] the [Title]" flavor text
**Notes:** Verified `docs/AI_OPPONENTS.md` has titles (e.g. "Katja Reiner — *The Ghost*") but `packages/ai/src/personalities/index.ts` does not yet carry a title field — CONTEXT.md flags this as new work.

---

## Chat Design

| Scope question | Description | Selected |
|--------|-------------|----------|
| Separate per room-phase | Lobby chat clears at match start; match chat is its own log | ✓ |
| One continuous log | Single thread spans lobby into match | |

**User's choice:** Separate per room-phase

| Identity question | Description | Selected |
|--------|-------------|----------|
| Codename only | Never reveals agent/seat identity | ✓ |
| Anonymous/seat-number only | More mysterious, diverges from rest of UI | |

**User's choice:** Codename only, never agent/seat identity

| Flavor prompts question | Description | Selected |
|--------|-------------|----------|
| Short curated set (~8-10), Claude drafts | Themed Cold War lines written during implementation | ✓ |
| User specifies exact list now | Lock exact text in this discussion | |

**User's choice:** A short curated set (~8-10), Claude drafts them

---

## Claude's Discretion

- Grace-period timer duration for disconnect-before-AI-takeover (D-07)
- Exact wording/placement of the kicked-player toast (D-06)
- Exact 8-10 flavor prompt lines and whether lobby/match sets differ (D-12)
- Directory room failure-recovery/dedup logic sizing (D-01)

## Deferred Ideas

- Per-room kick/ban list (rejected in favor of D-06's rejoin-allowed approach)
- Platform room-listing API or DB-backed registry (alternative to D-01, not chosen)
- Continuous single chat log spanning lobby→match (rejected in favor of D-10)
- Anonymous/seat-number-only chat attribution (rejected in favor of D-11)
