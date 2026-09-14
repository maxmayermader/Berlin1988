---
phase: 04
slug: deduction-surfaces-presentation-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-02
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^2.1.8 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `pnpm test <pattern>` (e.g. `pnpm test history`, `pnpm test motion`) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds (existing suite is fast; ~6ms/match sim harness unaffected) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test <touched-area-pattern>`
- **After every plan wave:** Run `pnpm test` (full suite) + `pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green, plus `pnpm test golden` explicitly re-run to confirm no fixture churn
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | MATCH-06 | T-04-01 | `resolveRound()` persists a per-player filtered history entry each round, matching `lastRoundLog` content for that round | unit | `pnpm test history` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | MATCH-06 | T-04-01 | Historical `STRIKE_FIRED` audibility does not change when a viewer's agent later moves near/away from the old strike location (Pitfall 1 regression) | unit | `pnpm test history` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | MATCH-06 | T-04-02 | `fog-leak.test.ts`'s existing deep-scan still passes with `history` present in serialized `PlayerView`s | unit | `pnpm test fog-leak` | ✅ | ⬜ pending |
| 04-02-01 | 02 | 2 | MATCH-06 | — | Round History panel renders condensed rows, empty state, and expands into `StepThrough` | unit (static-source) | `pnpm test roundHistoryPanel` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | MATCH-07 | — | Burn Track panel renders redacted entries icon-only, non-redacted entries with sector label | unit | `pnpm test burnTrackPanel` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | POLISH-01 | — | `apps/web/lib/motion.ts` exports duration/easing tokens and a reduced-motion-aware variant helper; `StepThrough.tsx` refactored onto it | unit (static-source) | `pnpm test motion` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | POLISH-01 | — | Existing `StepThrough.tsx` reduced-motion behavior unchanged after refactor | unit | `pnpm test stepThrough` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/tests/history.test.ts` — covers MATCH-06's persisted-history correctness and the Pitfall 1 audibility-stability regression
- [ ] `apps/web/lib/motion.test.ts` — static-source assertions for the new shared motion utility
- [ ] `apps/web/components/resolution/RoundHistoryPanel.test.tsx` — covers empty state, row rendering, expand-to-StepThrough
- [ ] `apps/web/components/intel/BurnTrackPanel.test.tsx` — covers redacted vs. non-redacted entry rendering (D-05)

---

## Manual-Only Verifications

*None: All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
