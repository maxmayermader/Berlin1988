---
phase: 5
slug: live-deployment
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.9 (unit/integration), Playwright 1.62.1 (E2E, separate runner) |
| **Config file** | `vitest.config.ts` (root) — includes `packages/**/tests/**/*.test.ts`, `apps/**/tests/**/*.test.ts`, `apps/**/*.test.ts`; Playwright specs in `apps/web/e2e/` are NOT picked up |
| **Quick run command** | `pnpm typecheck` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | typecheck ~10s; full suite ~580 tests |

**Phase-specific note:** this phase's primary deliverable is a deployment, not code. Most of its
acceptance is verified against the live URL (HTTP/WebSocket probes), not by the test suite. The suite
still matters here because D-04 puts `pnpm typecheck && pnpm test` in the Vercel build command — a red
suite must fail the deploy. That makes "the existing suite passes from a clean checkout" a
precondition of the phase, not an afterthought.

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green AND the deployed URL must answer
- **Max feedback latency:** ~60 seconds locally; a Vercel build adds the suite's runtime on top

---

## Per-Task Verification Map

Populated by the planner/executor as tasks are created. Deployment tasks verify against the live URL
rather than a test file — record the exact command (e.g. `curl -sS -o /dev/null -w '%{http_code}'
https://<project>.vercel.app`) in the Automated Command column.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T1 | 05-01 | 1 | DEPLOY-01 | T-05-SC | No package added; `pnpm-lock.yaml` byte-unchanged | build gate + grep | `(cd apps/web && export NEXT_PUBLIC_PARTYKIT_HOST=berlin1988-party.maxmayermader.partykit.dev && pnpm -w run typecheck && pnpm -w run test && pnpm run build) && grep -rq 'berlin1988-party\.maxmayermader\.partykit\.dev' apps/web/.next/static` | n/a (build output) | ⬜ pending |
| T2 | 05-01 | 1 | DEPLOY-01 | T-05-01 | Exactly one `NEXT_PUBLIC_*` coupling; no secret under that prefix | script, fail-first proven | `pnpm exec tsc -b apps/web/scripts --force && pnpm smoke:deploy https://berlin1988-no-such-deployment.vercel.app` (must exit non-zero) | ❌ → created by this task | ⬜ pending |
| T3 | 05-01 | 1 | DEPLOY-01 | T-05-02 | Test target is operator-supplied, never defaulted | config parse | `pnpm exec playwright test --list apps/web/e2e/home.spec.ts` with and without `PLAYWRIGHT_BASE_URL` | ✅ `playwright.config.ts` | ⬜ pending |
| T1 | 05-02 | 1 | DEPLOY-01 | T-05-03 | Deploy only from a clean tree at a recorded commit | smoke (HTTP) | `curl -s -o /dev/null -w '%{http_code}' -X POST …/parties/match/_new` = 200 AND `…/parties/directory/lobbies` no longer the unknown-party 404 | n/a (live host) | ⬜ pending |
| T2 | 05-02 | 1 | DEPLOY-01 | T-05-06 | Lobby created on the live host is recorded, not anonymous | e2e (Playwright) | `NEXT_PUBLIC_PARTYKIT_HOST=berlin1988-party.maxmayermader.partykit.dev pnpm exec playwright test apps/web/e2e/home.spec.ts` | ✅ `apps/web/e2e/home.spec.ts` | ⬜ pending |
| T1 | 05-03 | 2 | DEPLOY-01 | T-05-07, T-05-08 | No `vercel.json`; GitHub App scoped to one repo | manual + HTTP | `curl -s -o /dev/null -w '%{http_code}' <url>` = 200; `curl -sI <url> \| grep -i x-vercel-id`; `test ! -e vercel.json` | n/a (dashboard) | ⬜ pending |
| T2 | 05-03 | 2 | DEPLOY-01 | T-05-11 | Missing-env-var failure is detected post-deploy (D-02 forbids preventing it) | smoke + e2e | `EXPECT_PARTYKIT_HOST=berlin1988-party.maxmayermader.partykit.dev pnpm smoke:deploy "$DEPLOY_URL" && PLAYWRIGHT_BASE_URL="$DEPLOY_URL" pnpm exec playwright test apps/web/e2e/home.spec.ts` | ✅ (both created in wave 1) | ⬜ pending |
| T1 | 05-04 | 3 | DEPLOY-02 | T-05-12, T-05-13 | Gate runs inside the triggered build; stamp exposes only a public SHA | poll (HTTP) | poll `curl -s "$DEPLOY_URL/deploy-stamp"` until `.commit` equals `git rev-parse HEAD`, 15s × 60 | ❌ → created by this task | ⬜ pending |
| T2 | 05-04 | 3 | DEPLOY-02 | T-05-14, T-05-15 | Deployment attributable to a commit on `main` | manual (dashboard + browser) | — (dashboard provenance, build log ordering, rollback availability, two-browser session) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest and Playwright are installed and green
as of v1.0 close (580 tests). No new test framework is needed.

One gap worth closing inside this phase rather than assuming: nothing currently asserts that the
deployed bundle points at the production PartyKit host. A build that silently keeps the
`127.0.0.1:1999` fallback (D-02 keeps that fallback deliberately) would pass every existing test.

**Closed by plan 05-01 Task 2** — `apps/web/scripts/smoke-deployment.ts` (run via `pnpm
smoke:deploy <url>`) fetches the JavaScript a deployment actually serves, discovers the PartyKit
host inside it, optionally asserts it equals `EXPECT_PARTYKIT_HOST`, and then exercises that
discovered host's mint endpoint. Because D-02 keeps the fallback in the source, the honest signal
is the *positive presence* of the production host, not the absence of the fallback string — a
negative grep for the fallback would be unreliable, since whether the build folds the `??`
expression away is a minifier detail rather than a correctness one. The script is deliberately not
a `*.test.ts` file: anything matching the root vitest include globs would run inside D-04's build
gate, where it would fail for want of a deployment.

**Second gap found during planning, closed by plan 05-02:** the live PartyKit worker is running
pre-Phase-3 code (`/parties/directory/lobbies` returned PartyKit's unknown-party 404 when probed on
2026-09-18, and `.planning/` records no deploy after 2026-08-27). Nothing in the repository asserts
which commit the deployed room server runs, which is how it drifted eleven weeks behind `main`
unnoticed. Plan 05-04's `/deploy-stamp` route closes the equivalent gap on the web side.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel project creation, GitHub authorization, env var entry | DEPLOY-01, DEPLOY-02 | Requires the maintainer's Vercel account; no `vercel` CLI, no `gh` CLI, and no `.vercel/` link exist in this environment (re-confirmed during phase research) | Follow the checkpoint steps in the plan; report the resulting production URL back |
| A second person joining the deployed lobby from another machine | DEPLOY-01 (roadmap criterion 2) | Needs a second human on a different network/machine. **Partly automated during planning:** `apps/web/e2e/home.spec.ts` already drives two browser contexts through create-then-join, and plan 05-01 Task 3 lets it target a deployed URL — so the *second session* half is automated in 05-03 Task 2 and only the *second human on a second machine* half remains manual (Phase 10 / DEPLOY-03 per D-07) | Plan 05-04 Task 2 step 4: open the production URL, create a game, share the code with a second browser, confirm both seats appear on both screens; record what the second browser actually was |
| Merge-to-main triggers a deployment with no CLI | DEPLOY-02 | Provenance ("triggered by Git, not by a CLI") and the build log's step ordering are observable only in the Vercel dashboard. **The redeploy itself is now automated:** plan 05-04's `/deploy-stamp` route makes "which commit is live?" a `curl`, so the poll from push to new-commit-served is a runnable check | Plan 05-04 Task 1 polls `/deploy-stamp` for the pushed SHA; Task 2 steps 1-3 confirm provenance, the D-04 gate inside the build log, and rollback availability |
| Vercel build-log contents and instant-rollback availability | DEPLOY-02, D-03, D-04 | No API access without the `vercel` CLI, which is absent | Plan 05-04 Task 2 steps 2 and 3 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
