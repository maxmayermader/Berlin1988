---
phase: 3
slug: open-lobbies-host-control-table-talk
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | Root-level Vitest config (per-package, following the existing `packages/*/tests/` and `apps/web/lib/*.test.ts` convention) |
| **Quick run command** | `pnpm test -- <pattern>` (e.g. `pnpm test -- directory`) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds (consistent with existing suite size) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <touched-file-pattern>`
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green, plus the manual deployed-environment check noted below once `apps/web` has a Vercel deployment
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-xx | TBD | W0 | HOME-03 | — | Directory list reflects seat count/host codename on register/update/unregister | unit | `pnpm test -- directory` | ❌ W0 | ⬜ pending |
| 03-01-xx | TBD | W0 | LOBBY-01 | V4 host check | `SET_SEAT_COUNT` accepted 1–4 pre-start, rejected mid/post-match, non-host rejected | unit | `pnpm test -- handlers` | ❌ W0 | ⬜ pending |
| 03-01-xx | TBD | W0 | LOBBY-02 | V4 host check | `KICK` removes a seat, target receives `KICKED`, non-host `KICK` rejected | unit | `pnpm test -- handlers` | ❌ W0 | ⬜ pending |
| 03-01-xx | TBD | W0 | LOBBY-06 | Integrity (order-overwrite race) | Grace-period expiry triggers takeover; reclaim flips control back without double-submit; reclaimed seat's order never overwritten by a stale `BotSubmission` | unit + integration | `pnpm test -- bots` / `pnpm test -- room` | ❌ W0 | ⬜ pending |
| 03-01-xx | TBD | W0 | LOBBY-07 | — | Public snapshot exposes `"Name the Title"` for AI-controlled seats | unit | `pnpm test -- state` / `pnpm test -- seatRows` | ❌ W0 | ⬜ pending |
| 03-01-xx | TBD | W0 | CHAT-01/02/03 | V5 input validation, fog-of-war | `CHAT_SEND` broadcasts `CHAT_MESSAGE` with codename attribution only, scoped to lobby vs. match log; never carries agent/seat identity | unit + wire-level fog-style scan | `pnpm test -- chat` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/party/tests/directory.test.ts` (or equivalent) — covers HOME-03's register/update/unregister state transitions
- [ ] New cases in the existing handlers test file — covers LOBBY-01/LOBBY-02's accept/reject paths
- [ ] `apps/party/tests/bots.test.ts` extension (or new `takeover.test.ts`) — covers LOBBY-06's takeover + the verified `submitOrder()` overwrite race, with a regression test asserting a reclaimed seat's order is never overwritten by a stale `BotSubmission`
- [ ] Extension of `apps/web/lib/seatRows.test.ts` — covers LOBBY-07's `"Name the Title"` readout
- [ ] New `chat.test.ts` (party-side) — covers CHAT-01/02/03, including a fog-style scan asserting `CHAT_MESSAGE` never carries agent/seat identity fields (D-11)
- [ ] Framework install: none — Vitest is already fully configured project-wide

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live open-lobbies list across two real browser sessions | HOME-03 | Cross-room, cross-connection UX not easily asserted by unit tests alone | Open home page in two browser tabs/sessions, create a lobby in one, confirm it appears in the other's list within a few seconds, then confirm it disappears once the match starts |
| Disconnect → grace period → AI takeover → reconnect → reclaim, observed end-to-end | LOBBY-06 | Depends on real PartyKit connection lifecycle (`onClose`, hibernation) not fully reproducible in unit tests per research's Pitfall 3/Assumption A1 | Start a match, close one player's tab, wait past the grace period, confirm AI takes over and the match continues, then reopen with the same identity/token and confirm the seat is reclaimed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
