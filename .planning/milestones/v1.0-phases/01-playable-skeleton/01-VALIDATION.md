---
phase: 1
slug: playable-skeleton
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 (already root-installed) |
| **Config file** | `vitest.config.ts` (root) — currently scoped to `packages/**/tests/**/*.test.ts`; must be extended to include `apps/web` and `apps/party` test paths this phase |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds (existing suite is fast per CONCERNS.md; new `apps/*` tests are integration tests against a local room, not real network) |

Playwright is referenced in `docs/ARCHITECTURE.md` §6 as the intended E2E tool but is **not yet installed** anywhere in the repo — genuine Wave 0 gap.

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test` + `pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green. The wire-level fog test (MATCH-03/04) and the 4-bot timing spike are non-negotiable gates — they're the two highest-severity risks this phase's research identified.
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-xx-xx | TBD | TBD | HOME-01/HOME-02 | — | N/A | E2E (Playwright, two browser contexts) | `pnpm test:e2e -- home.spec.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | LOBBY-03/LOBBY-04 | — | N/A | Integration (PartyKit room, simulated connections) | `pnpm test -- lobby.test.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | LOBBY-05 | — | N/A | Integration (room + `@berlin/ai`) | `pnpm test -- botfill.test.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | MATCH-01/MATCH-02 | — | N/A | Component/integration | `pnpm test -- board.test.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | MATCH-03/MATCH-04 | T-1-01 | Per-connection `projectView()`; no opponent position/safehouse/trap/cooldown bytes on the wire | Integration, wire-level (captures literal per-connection payload) | `pnpm test -- fog-wire.test.ts` | ❌ W0 (highest priority) | ⬜ pending |
| 01-xx-xx | TBD | TBD | MATCH-05 | — | N/A | Unit (client gating state) + integration (log order matches `resolution/index.ts`) | `pnpm test -- stepthrough.test.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | MATCH-08 | — | N/A | Integration (drive engine to each `OutcomeReason`, assert UI render) | `pnpm test -- result.test.ts` | ❌ W0 | ⬜ pending |

*The planner fills in Task ID / Plan / Wave columns when PLAN.md files are created.*

---

## Wave 0 Requirements

- [ ] Install Playwright for `apps/web` E2E (`docs/ARCHITECTURE.md` §6 specifies this tool; not yet installed)
- [ ] Extend `vitest.config.ts` include pattern to cover `apps/web/**/*.test.ts` and `apps/party/**/*.test.ts`
- [ ] `apps/party/tests/fog-wire.test.ts` — wire-level fog-of-war integration test (highest priority; extends the pattern in `packages/engine/tests/fog-leak.test.ts` one layer up)
- [ ] A one-time 4-bot concurrent-timing measurement script (not a standing test) — run against a local `partykit dev` room before shipping
- [ ] `apps/party/tests/helpers.ts` — simulated-connection test harness for the PartyKit room (mirrors `packages/engine/tests/helpers.ts`'s existing pattern)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 4-player concurrent timing under real latency | (ROADMAP.md research flag) | One-time measurement, not a standing regression test; depends on real network conditions | Run a local `partykit dev` room with 4 simulated bot connections, measure message queue depth and latency, confirm 90s round timer holds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
