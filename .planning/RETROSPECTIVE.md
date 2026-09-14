# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-09-14
**Phases:** 4 | **Plans:** 18 | **Sessions:** several (spanning 2026-08-11 → 2026-09-14)

### What Was Built
- A full 14-round hidden-movement match, playable end to end from the home page through a lobby to a result screen, against humans or AI (Phase 1).
- A persistent 34-card deckbuilder with a live legality meter, shared identically between the home page and the mid-lobby edit flow (Phase 2).
- Public open-lobby browsing, host seat/kick control, and reversible AI-takeover-and-reclaim on disconnect (Phase 3).
- Lobby and in-match chat with server-resolved codenames (Phase 3).
- A fog-safe round history log and a Burn Track deduction panel, plus an app-wide reduced-motion-respecting motion system (Phase 4).
- `apps/party` deployed and verified live on Cloudflare Durable Objects.

### What Worked
- **Walking-skeleton-first roadmap ordering** — Phase 1 shipped a genuinely playable, if ugly, full match before any deckbuilder, lobby browser, or polish existed. Every later phase layered onto something already working end to end, rather than assembling isolated parts that only paid off at the very end.
- **Research catching a real correctness bug before planning** — Phase 4's research explicitly investigated the naive round-history implementation and found it would silently mis-grade `STRIKE_FIRED` audibility using a viewer's *current* agent position instead of their position at the time of that historical round. The fix (filter once, at round-resolution time, mirroring the existing `burnTracks` discipline) was designed before a single planning task was written, and the plan-checker and code-reviewer both independently re-verified the fix was actually implemented correctly, not just described.
- **Worktree-isolated parallel executors** for independent plans in the same wave (e.g. 04-02 Round History UI and 04-03 Burn Track UI) — genuinely sped up wall-clock phase execution with zero file conflicts, once the fork-base tracking issue below was fixed.
- **TDD gate (RED commit before GREEN commit)** enforced across every implementation task this phase, closing the gap between "claims tests pass" and "a red test actually existed and then went green."
- **Independent verification, not summary-trusting** — the phase-4 verifier reproduced RESEARCH.md's fog-of-war regression scenario itself (move a viewer's agent adjacent to an old strike in a later round, assert the historical grading is frozen) rather than accepting the executor's SUMMARY.md claim at face value.

### What Was Inefficient
- **Worktree fork-base drift (#683 class)** — two Wave 2 executors forked from a commit that predated Wave 1's merge, both correctly self-halted per their safety guard rather than proceeding on a stale base, but this cost a full respawn cycle. Root cause: `worktree.baseRef` wasn't set to track live HEAD from the start of the phase. Fixed mid-phase (`gsd worktree set-baseref`); should be set proactively at phase-execution start on any project using worktree isolation.
- **`apps/web` was never deployed to Vercel** during the entire v1.0 build. This silently blocked Phase 1's own phase-gate checkpoint (hibernation-under-a-real-client, four-player human-plausibility read) for the whole milestone, and is very likely the root cause of the Phase 1/2 UAT gaps acknowledged at milestone close — there was simply never a live URL to test against. This should have been flagged and resolved much earlier, ideally before Phase 1 closed, rather than carried silently across three more phases.
- **`commit_docs: false`** meant every phase's planning artifacts (CONTEXT/RESEARCH/PATTERNS/UI-SPEC/VALIDATION/VERIFICATION/REVIEW) accumulated as uncommitted changes throughout execution, only getting swept into git at moments the workflow treats as *structurally required* regardless of that setting (the milestone-close safety commit). Worth deciding explicitly whether this project wants docs committed per-phase going forward, rather than rediscovering the accumulation each time.

### Patterns Established
- Server-side "filter once, at the moment of truth, store the answer" is now the established pattern for any player-visible fact derived from state that changes over time (first used for `burnTracks`, now generalized to round `history`) — the next feature needing this shape should reuse it without re-deriving the reasoning.
- One shared motion utility (`apps/web/lib/motion.ts`) as the app's single `prefers-reduced-motion` code path, enforced by a cross-file test asserting no component re-implements the branch inline.

### Key Lessons
1. When a UI-SPEC or PLAN references a checkpoint that needs a live deployed URL, verify the deployment actually exists *before* the phase that depends on it closes — don't let "blocked, no deploy" silently ride across multiple subsequent phases as an unresolved UAT gap.
2. Set `worktree.baseRef: "head"` before the first wave of any phase that uses parallel worktree-isolated executors, not reactively after the first fork-base mismatch.
3. A plan-checker/code-reviewer pass that explicitly re-reads the flagged research risk (not just "were tests added") catches the difference between "a fix was described" and "a fix was implemented" — worth keeping as a standing instruction whenever RESEARCH.md names a specific correctness pitfall.

### Cost Observations
- Model mix: opus for planning (dense synthesis across CONTEXT/RESEARCH/PATTERNS/UI-SPEC), sonnet for research and execution, haiku for plan/UI checking.
- Sessions: several across a 23-day span, with Phase 4 executed in a single continuous multi-wave session.
- Notable: parallel worktree execution in Wave 2 (two independent plans) completed both in roughly the time of one sequential plan, once the base-tracking issue was resolved.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | several | 4 | First milestone — walking-skeleton-first roadmap, research-driven planning, worktree-parallel execution |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|--------------------|
| v1.0 | 580 | not separately tracked | 0 (no new runtime dependencies added in Phase 4; `motion` already existing) |

### Top Lessons (Verified Across Milestones)

1. Deploy-dependent checkpoints need the deployment resolved *before* the phase closes, not carried forward as an open gap — first observed in v1.0.
2. Worktree base-ref tracking must be set proactively for parallel execution phases — first observed in v1.0.
