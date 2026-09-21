# Phase 5: Live Deployment - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Get `apps/web` onto a public Vercel URL wired to the already-live PartyKit server (`berlin1988-party.maxmayermader.partykit.dev`), and keep it current automatically as `main` moves. Covers DEPLOY-01 and DEPLOY-02 only.

This phase ships no gameplay, UI, or content change. The full human playtest on the deployed site (DEPLOY-03/DEPLOY-04) is Phase 10's closing gate, not this phase's.

Why it is first: in v1.0 a deploy-dependent checkpoint (01-06 Task 3) rode silently across all four phases and left 3 UAT scenarios and 2 `human_needed` verification reports open. Phases 6-10 are meant to verify against a live URL, which only exists if this phase closes.

</domain>

<decisions>
## Implementation Decisions

### Preview Deployments (discussed)

- **D-01:** Every branch gets a public preview URL, pointed at the **production** PartyKit host. No staging PartyKit deployment in v1.1 (`DEPLOY-05` is deferred). Preview lobbies therefore appear in the public open-lobby list that real players browse — the user accepted this explicitly rather than turning previews off or protecting them.
- **D-02:** The `NEXT_PUBLIC_PARTYKIT_HOST` fallback in `apps/web/lib/socket.ts:23` (`?? '127.0.0.1:1999'`) **stays as it is**. No build-time guard, no in-app "not configured" error. The user was shown the failure mode this keeps (a deploy missing the variable connects to nothing and fails silently, and the D-04 build gate cannot catch it) and chose to keep today's behavior.
- **D-03:** Recovery from a bad deploy is **Vercel's instant rollback** — promote the previous deployment from the dashboard. Not a git revert, and not a documented dual procedure.
- **D-04:** The Vercel build command runs **`pnpm typecheck` and `pnpm test` before `next build`**, so a commit that breaks types or the 580-test suite fails the deploy instead of shipping. Build time cost accepted. This is a build-command decision, not a CI pipeline — no `.github/workflows` is in scope here.

### Claude's Discretion

The user reviewed four gray areas and chose to discuss only preview deployments. The other three are Claude's call; these are the working defaults, and the planner may refine them:

- **Setup path and handoff (D-05):** Use Vercel's **Git integration** rather than CLI-only linking — D-04's auto-deploy-on-merge requirement effectively demands it. Expect a human step: no Vercel CLI or linked project existed in v1.0's environment, so the maintainer likely has to create/link the project and authorize the GitHub app. The plan must make that an explicit checkpoint with copy-pasteable settings (Root Directory `apps/web`, "include source outside the root directory", Node 22+, the build command from D-04, `NEXT_PUBLIC_PARTYKIT_HOST` for Production and Preview), not an agent task that silently stalls the way v1.0's did. — **Reversibility:** costly — the Vercel project name sets the default `*.vercel.app` URL; renaming later breaks any link friends have already saved.
- **URL and discoverability (D-06):** Ship on the default `*.vercel.app` URL. No custom domain, no search-engine blocking. Revisit only if the user asks — a custom domain is a purchase decision that is theirs to make, and anonymous play plus a public lobby browser already assumes anyone with the link can join.
- **What counts as done (D-07):** Phase 5 closes on an agent-run smoke test against the deployed URL (home page loads, a game can be created, the socket reaches the production PartyKit host rather than localhost) plus a second browser session joining the same lobby. The roadmap's "two people on different machines" criterion is satisfied at whatever fidelity is available; a genuine multi-person, multi-machine session is Phase 10's DEPLOY-03 gate and must not be double-booked here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's scope
- `.planning/REQUIREMENTS.md` — DEPLOY-01 and DEPLOY-02 are this phase's whole scope; DEPLOY-03/04 belong to Phase 10 and DEPLOY-05 (staging PartyKit) is deferred
- `.planning/ROADMAP.md` — Phase 5 entry: goal, 3 success criteria, known risks, and the "why this is its own phase" rationale

### Deployment specifics
- `.planning/research/STACK.md` — the Vercel monorepo recipe: Root Directory, "include source outside the root directory", `transpilePackages`, Node pinning, build-time `NEXT_PUBLIC_*`, `wss://` negotiation, and why not Turborepo
- `.planning/research/PITFALLS.md` §Pitfall 17 — pnpm workspace resolution, Node version, env inlining, preview-vs-production hosts, and CLI/auth availability for an automated agent
- `.planning/RETROSPECTIVE.md` — v1.0's top lesson: resolve deploy-dependent checkpoints before the phase closes, never carry them forward
- `.planning/codebase/INTEGRATIONS.md` — the current integration map. ⚠️ Its claim that "Preview environments point at staging PartyKit host" is aspirational and now contradicted by D-01; treat D-01 as authoritative and correct this file when convenient

### Project constraints
- `.planning/PROJECT.md` — Hosting constraint (`apps/web` → Vercel, `apps/party` live on Cloudflare) and the Key Decision recording why v1.0 never deployed
- `docs/ARCHITECTURE.md` §5 — the wire protocol; `NEXT_PUBLIC_PARTYKIT_HOST` is the only coupling between the two apps

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/lib/socket.ts:23` — the single read of `NEXT_PUBLIC_PARTYKIT_HOST`, with the `127.0.0.1:1999` fallback D-02 preserves. One place to verify the deployed build points at production
- `apps/party` — already deployed and verified live on Cloudflare. Nothing in this phase redeploys or modifies it
- Root `package.json` — `typecheck` (`tsc --build`), `test` (`vitest run`); D-04's build command composes these two existing scripts rather than inventing new ones
- `packageManager: "pnpm@9.15.4"` is already pinned at the repo root, which is what Vercel reads to select pnpm

### Established Patterns
- `packages/shared` and `packages/engine` both declare `"main": "./src/index.ts"` with `"exports": { ".": "./src/index.ts" }` and **no build step** — `apps/web` imports raw TypeScript source across the workspace. This is the root cause behind the missing `transpilePackages`
- `pnpm-workspace.yaml` covers `packages/*` and `apps/*`; the web app builds from inside a workspace, not standalone
- Engine purity and fog rules are untouched by this phase — no `packages/` change is expected at all

### Integration Points
- `apps/web/next.config.ts` — has `reactStrictMode` and a webpack `extensionAlias` for `.js` → `.ts/.tsx`, but **no `transpilePackages`**. Research names this the likely first build failure
- No `vercel.json`, no `.vercel/` link, no `.github/workflows/`, no `.env*` files anywhere in the repo. Everything deployment-related is greenfield
- `apps/web/package.json` build script is a bare `next build`; D-04's gate either wraps it here or lives in the Vercel build-command field (planner's choice — prefer whichever keeps local `pnpm build` honest)

</code_context>

<specifics>
## Specific Ideas

- The user accepted preview lobbies mixing into the public open-lobby list rather than turning previews off — sharing a work-in-progress branch URL matters more than keeping the live list clean.
- The user declined to harden the missing-env-var path even after seeing that D-01 makes it easier to hit. Do not "helpfully" add a build guard or an error screen; that decision was made with the failure mode on the table.
- Rollback is a dashboard action, not a git workflow. Plans should not add revert tooling.

</specifics>

<deferred>
## Deferred Ideas

- **Staging PartyKit deployment** (`DEPLOY-05`, already in REQUIREMENTS.md "Future") — would give previews their own server and remove D-01's shared-lobby side effect. Deferred at requirements time; revisit if preview lobbies become a nuisance in practice.
- **CI pipeline** (`.github/workflows` running typecheck/tests/fog-scan on PRs) — D-04 puts the gate in the Vercel build instead. A real CI pipeline is a separate concern and belongs in its own phase if the project wants one.
- **Custom domain** — not chosen; the default `*.vercel.app` URL ships. A purchase decision the user can make later.
- **Correcting `.planning/codebase/INTEGRATIONS.md`** — its staging-preview line is stale. Cheap fix, but out of this phase's scope.

</deferred>

---

*Phase: 5-Live Deployment*
*Context gathered: 2026-09-18*
