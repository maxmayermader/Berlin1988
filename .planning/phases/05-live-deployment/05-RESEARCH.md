# Phase 5: Live Deployment - Research

**Researched:** 2026-09-18
**Domain:** First-ever Vercel deployment of a Next.js 15 App Router app inside a pnpm 9 workspace monorepo, wired to an already-live PartyKit (Cloudflare Durable Object) realtime backend
**Confidence:** HIGH (Vercel monorepo/env-var mechanics, Node version table, and Ignored-Build-Step semantics are CITED against current official docs fetched this session; the `partysocket` protocol-negotiation and PartyKit CORS claims are VERIFIED by reading the actual installed package source and this repo's own `room.ts`, not just docs)

## Summary

This phase has no code-correctness risk — the engine, protocol, and room server are untouched — but it is a pure "first time we've ever done this" operational risk, and the two prior sessions' history (RETROSPECTIVE.md, STATE.md) shows it stalling silently rather than failing loudly. The dominant finding this session, verified directly against the installed `partysocket@1.3.0` package source, is that the `ws://` vs `wss://` decision this phase's risk list worried about is **not actually a risk**: `partysocket` derives the protocol from the *host string's* shape (loopback/private-IP prefixes get `ws`, everything else gets `wss`), not from `window.location.protocol` as both `STACK.md` and `PITFALLS.md` assumed. That means the existing code needs zero changes for secure-WebSocket negotiation — `apps/web/lib/socket.ts:23`'s bare-host env var already produces the right scheme for both `127.0.0.1:1999` (dev) and the production PartyKit host, automatically, with no protocol prefix ever needed in `NEXT_PUBLIC_PARTYKIT_HOST`. Similarly, `apps/party/src/room.ts:87-90` already documents (correctly) that WebSocket connections aren't subject to CORS at all — only the plain-HTTP `_new` mint endpoint needs an origin header, and it already sends a permissive one. **No `apps/party` change of any kind is required by this phase.**

The remaining real risk is entirely on the Vercel/`apps/web` side, and it is exactly what `STACK.md` and `PITFALLS.md` §17 already scoped, with three corrections this session found worth flagging: (1) Next.js's own current docs say webpack already auto-transpiles workspace packages under the App Router with no config — `transpilePackages` may already be redundant for this exact app, but adding it anyway costs nothing and removes the ambiguity, so do it regardless of whether it's technically load-bearing; (2) the "Include source files outside of the Root Directory" toggle has been **on by default since August 2020** for new Vercel projects, so this project (created 2026) almost certainly gets it for free — verify, don't configure; (3) `STACK.md`'s suggested `"engines": {"node": ">=22.0.0"}` does **not** pin Node 22 the way it sounds — per Vercel's own version-resolution table, an open-ended `>=` range resolves to the *newest* available major (24.x today), not the minimum. To actually get Node 22, the value must be a bounded range like `"22.x"`.

**Primary recommendation:** Ship this as a single Vercel project (Root Directory `apps/web`, Git integration, default `*.vercel.app` domain), with a Build Command override of `pnpm -w run typecheck && pnpm -w run test && pnpm run build` (verified to resolve correctly from `apps/web`'s working directory via pnpm's `-w` flag) satisfying D-04, `"engines": {"node": "22.x"}` in the root `package.json`, `NEXT_PUBLIC_PARTYKIT_HOST=berlin1988-party.maxmayermader.partykit.dev` (bare host, no scheme) set for both Production and Preview environments, and no `apps/party` changes at all. The one unresolved, non-technical blocker is identical to what RETROSPECTIVE.md already named: no `vercel` CLI, no linked `.vercel/` project, and no `gh` CLI exist in this environment (all three confirmed absent this session) — project creation and GitHub-app authorization must be a human checkpoint, not an agent task.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Every branch gets a public preview URL, pointed at the **production** PartyKit host. No staging PartyKit deployment in v1.1 (`DEPLOY-05` is deferred). Preview lobbies therefore appear in the public open-lobby list that real players browse — the user accepted this explicitly rather than turning previews off or protecting them.
- **D-02:** The `NEXT_PUBLIC_PARTYKIT_HOST` fallback in `apps/web/lib/socket.ts:23` (`?? '127.0.0.1:1999'`) **stays as it is**. No build-time guard, no in-app "not configured" error. The user was shown the failure mode this keeps (a deploy missing the variable connects to nothing and fails silently, and the D-04 build gate cannot catch it) and chose to keep today's behavior.
- **D-03:** Recovery from a bad deploy is **Vercel's instant rollback** — promote the previous deployment from the dashboard. Not a git revert, and not a documented dual procedure.
- **D-04:** The Vercel build command runs **`pnpm typecheck` and `pnpm test` before `next build`**, so a commit that breaks types or the 580-test suite fails the deploy instead of shipping. Build time cost accepted. This is a build-command decision, not a CI pipeline — no `.github/workflows` is in scope here.

### Claude's Discretion

- **Setup path and handoff (D-05):** Use Vercel's **Git integration** rather than CLI-only linking — D-04's auto-deploy-on-merge requirement effectively demands it. Expect a human step: no Vercel CLI or linked project existed in v1.0's environment, so the maintainer likely has to create/link the project and authorize the GitHub app. The plan must make that an explicit checkpoint with copy-pasteable settings (Root Directory `apps/web`, "include source outside the root directory", Node 22+, the build command from D-04, `NEXT_PUBLIC_PARTYKIT_HOST` for Production and Preview), not an agent task that silently stalls the way v1.0's did. — **Reversibility:** costly — the Vercel project name sets the default `*.vercel.app` URL; renaming later breaks any link friends have already saved.
- **URL and discoverability (D-06):** Ship on the default `*.vercel.app` URL. No custom domain, no search-engine blocking. Revisit only if the user asks — a custom domain is a purchase decision that is theirs to make, and anonymous play plus a public lobby browser already assumes anyone with the link can join.
- **What counts as done (D-07):** Phase 5 closes on an agent-run smoke test against the deployed URL (home page loads, a game can be created, the socket reaches the production PartyKit host rather than localhost) plus a second browser session joining the same lobby. The roadmap's "two people on different machines" criterion is satisfied at whatever fidelity is available; a genuine multi-person, multi-machine session is Phase 10's DEPLOY-03 gate and must not be double-booked here.

### Deferred Ideas (OUT OF SCOPE)

- **Staging PartyKit deployment** (`DEPLOY-05`, already in REQUIREMENTS.md "Future") — would give previews their own server and remove D-01's shared-lobby side effect. Deferred at requirements time; revisit if preview lobbies become a nuisance in practice.
- **CI pipeline** (`.github/workflows` running typecheck/tests/fog-scan on PRs) — D-04 puts the gate in the Vercel build instead. A real CI pipeline is a separate concern and belongs in its own phase if the project wants one.
- **Custom domain** — not chosen; the default `*.vercel.app` URL ships. A purchase decision the user can make later.
- **Correcting `.planning/codebase/INTEGRATIONS.md`** — its staging-preview line is stale. Cheap fix, but out of this phase's scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | Anyone with the link can open the game at a public Vercel URL that connects to the live PartyKit server | Vercel project config (Root Directory, include-outside-root toggle, `NEXT_PUBLIC_PARTYKIT_HOST`) below produces a working `*.vercel.app` deployment; `partysocket` source-verified to auto-select `wss://` for the production host with no code change |
| DEPLOY-02 | Merging to `main` redeploys the site automatically | Vercel Git integration (D-05) auto-deploys `main` by default; `git.deploymentEnabled`/Ignored Build Step only needed if that default behavior is ever restricted |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Static/SSR hosting of `apps/web` | CDN / Static + Frontend Server (SSR) | — | Vercel serves Next.js App Router output as a mix of static assets and edge/serverless functions; no new tier is introduced by this phase |
| Build-time type/test gate (D-04) | Frontend Server (SSR) build pipeline | — | Runs inside Vercel's build container before `next build`; not a separate CI tier per the explicit decision to avoid `.github/workflows` this phase |
| Realtime match authority | API / Backend (already deployed) | — | `apps/party` on Cloudflare Durable Objects is out of scope for this phase; nothing here changes its tier or its code |
| WebSocket protocol negotiation (`ws`/`wss`) | Browser / Client | — | Resolved entirely inside `partysocket` from the configured host string, before any request leaves the browser — no server-side negotiation exists |
| Deploy trigger / rollback | CDN / Static (Vercel platform) | — | Git-push-triggered build and dashboard-driven instant rollback are both Vercel platform mechanics, not application code |

## Standard Stack

No new runtime or dev dependency is introduced by this phase — it is entirely Vercel project configuration, one `next.config.ts` addition, and one root `package.json` field. `apps/web/package.json` and root `package.json` already carry every package this phase touches (`next`, `partysocket`, `zod`).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Build Command running `pnpm -w run typecheck && pnpm -w run test` | A separate `.github/workflows` CI pipeline | Explicitly deferred (CONTEXT.md) — would duplicate D-04's gate in a second system for no benefit this phase needs |
| A hand-written git-diff Ignored Build Step | Vercel's native "skip unaffected projects" (on by default for GitHub-connected monorepos meeting workspace-name-uniqueness requirements — already true here) | The native feature requires zero configuration and is more precise (dependency-graph aware, not just path-glob aware) — see State of the Art below |
| `"engines": {"node": ">=22.0.0"}` | `"engines": {"node": "22.x"}` | The open-ended range resolves to Vercel's *newest* available major (24.x today) per Vercel's own version table, not the minimum — use the bounded form if the intent is genuinely "pin to 22" |

## Package Legitimacy Audit

**Not applicable this phase.** No package is added to `package.json` in any workspace — this phase is Vercel project configuration, `next.config.ts` edits, and one `engines` field. `npm view` / registry checks were not run because there is nothing new to check.

## Architecture Patterns

### System Architecture Diagram

```
Developer pushes to `main` (GitHub: maxmayermader/Berlin1988)
        │
        ▼
Vercel Git integration receives webhook
        │
        ▼
Vercel build container (Root Directory = apps/web, "include source
outside Root Directory" = on)
        │
        ├─ pnpm install (from monorepo root — resolves workspace:* deps)
        │
        ├─ pnpm -w run typecheck   (tsc --build, root tsconfig.json
        │                           project references, covers all
        │                           packages + apps/web + apps/party)
        │       │
        │       └─ fail ──────────────► deploy aborted, previous
        │                                production deployment stays live
        │
        ├─ pnpm -w run test        (vitest run, root vitest.config.ts,
        │                           580-test suite: engine, ai, shared,
        │                           web unit/static-source tests —
        │                           Playwright e2e is NOT included, see
        │                           Common Pitfalls)
        │       │
        │       └─ fail ──────────────► deploy aborted, previous
        │                                production deployment stays live
        │
        └─ pnpm run build          (= `next build`, cwd apps/web,
                                     NEXT_PUBLIC_PARTYKIT_HOST inlined
                                     into the client bundle here)
                │
                ▼
        New deployment (Preview or Production) live at
        *.vercel.app
                │
                ▼
        Browser loads the page over HTTPS, `partysocket` builds
        the room URL from NEXT_PUBLIC_PARTYKIT_HOST
                │
                ▼
        Host string is NOT loopback/private-IP shaped
        (`berlin1988-party.maxmayermader.partykit.dev`)
                │
                ▼
        partysocket selects `wss://` automatically (no code path,
        no env var scheme needed) and opens the WebSocket
                │
                ▼
        Cloudflare Durable Object (apps/party, already live,
        untouched by this phase) — CORS does not apply to this
        WebSocket upgrade; only the plain-HTTP `_new` mint
        endpoint needs (and already has) an Access-Control-Allow-
        Origin header
```

### Recommended Project Structure

No new files or directories are needed beyond one edit and one addition:

```
apps/web/next.config.ts     # add transpilePackages
package.json                 # add "engines": { "node": "22.x" }
```

`vercel.json` is optional this phase — every setting needed (Root Directory, include-outside-root toggle, Build Command override, env vars) is a dashboard setting under Vercel's Git-integration flow, and CONTEXT.md's D-05 explicitly wants the human checkpoint to use copy-pasteable dashboard settings rather than a committed config file. A `vercel.json` is not wrong, but it isn't required to satisfy DEPLOY-01/02 and keeping the setup dashboard-driven matches "Git integration, not CLI-only" (D-05) more directly.

### Pattern: Root-scoped build gate from a scoped Root Directory

**What:** Use pnpm's `-w`/`--workspace-root` flag to run root-defined scripts (`typecheck`, `test`) from within a Build Command whose working directory is `apps/web` (the Vercel Root Directory), rather than `cd ../..`-style relative traversal.

**When to use:** Any Vercel monorepo project where Root Directory is a workspace member but the quality gate needs to run root-scoped tooling (TS project references, a root `vitest.config.ts` with cross-package aliases).

**Example — verified this session by direct execution:**
```bash
# Run from inside apps/web (this repo, this session):
cd apps/web && pnpm -w run typecheck --help
# → resolves and runs the ROOT package.json's "typecheck" script
#   ("tsc --build") from the ROOT working directory, confirmed by the
#   printed banner:
#   > berlin1988@ typecheck /Users/maxmay/Documents/GitHub/Berlin1988
#   > tsc --build "--help"
```
Vercel Build Command (dashboard override, Framework Preset = Next.js, Root Directory = `apps/web`):
```
pnpm -w run typecheck && pnpm -w run test && pnpm run build
```
The trailing `pnpm run build` has no `-w` — it must run apps/web's own local `build` script (`next build`) with cwd still at `apps/web`, so Vercel's Next.js framework preset finds `.next` where it expects it.

### Anti-Patterns to Avoid

- **Setting a protocol scheme in `NEXT_PUBLIC_PARTYKIT_HOST`:** `partysocket` strips any `http(s)|ws(s)://` prefix from the host string before deciding the protocol itself (verified in source, see Code Examples) — supplying `wss://berlin1988-party...` would be silently stripped and cause no harm, but it documents a false belief about how the negotiation works. Keep the value a bare host, matching D-02's existing code.
- **Adding `outputFileTracingRoot` or `serverExternalPackages` speculatively:** Per current Next.js docs (fetched this session), `outputFileTracingRoot` addresses file-tracing for `output: 'standalone'` self-hosted deployments in a monorepo — this project deploys natively to Vercel with no `output: 'standalone'` config, so it does nothing here. `serverExternalPackages` is for excluding a package from bundling (the opposite of what `@berlin/shared`/`@berlin/engine` need). Neither belongs in this phase's `next.config.ts` change.
- **Writing a custom git-diff Ignored Build Step before checking the native feature:** Vercel's "skip unaffected projects" (on by default for GitHub-connected, workspace-convention-following monorepos — this repo qualifies) already does dependency-graph-aware build skipping for free. A hand-written Ignored Build Step is strictly less precise (path-glob based) and duplicates work the platform already does — only add one if the native feature is confirmed insufficient after the project exists.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ws vs wss selection | A `window.location.protocol` check in `socket.ts` | Nothing — `partysocket` already does this from the host string (verified) | Already correct; adding client-side scheme logic would be dead code at best, a second source of truth at worst |
| Skipping builds for unrelated commits (e.g. `.planning/`-only) | A git-diff Ignored Build Step script | Vercel's native "skip unaffected projects" monorepo feature | Free, dependency-graph-aware, requires zero maintenance — only fall back to a custom script if the native feature's requirements (unique workspace package names — already true here) stop being met |
| Deploy rollback tooling | A git-revert-and-redeploy script or runbook | Vercel's dashboard Instant Rollback (D-03) | Explicitly decided; it re-points production to a previously-served deployment with no rebuild, which a git-revert-based approach can't match for speed and which the user chose over building one |
| CORS handling for the WebSocket connection | A CORS/origin-allowlist change to `apps/party` | Nothing — WebSocket upgrades aren't subject to CORS, and `room.ts` already documents this correctly | The room's own code comment (`room.ts:87-90`) already gets this right; touching it would be an unnecessary, security-adjacent change to a package this phase should not modify at all |

**Key insight:** every temptation in this phase to write custom glue code (protocol detection, build-skip scripting, CORS config) turns out to be either already handled by a library/platform default, or already correctly implemented in this exact codebase. The actual work is dashboard configuration plus two small file edits.

## Common Pitfalls

### Pitfall 1: `transpilePackages` ambiguity — add it anyway, don't investigate whether it's "truly" required

**What goes wrong:** Current Next.js documentation (fetched this session, version banner 16.3.5) states "Turbopack transpiles workspace packages... automatically under both routers. Webpack does the same for the App Router." `apps/web` is App Router only. Taken at face value, this suggests `transpilePackages: ['@berlin/shared', '@berlin/engine']` might already be redundant for the exact webpack + App Router combination this project uses — and a planner or executor could spend real time trying to confirm whether the installed `next@15.5.23` already has this specific auto-detection behavior (the docs don't state which exact version introduced automatic, config-free workspace-package transpilation for webpack+App Router, as distinct from the `transpilePackages` config option itself, which has existed since 13.1).

**Why it happens:** The docs conflate two different features under one sentence — "transpilePackages exists as an opt-in config" (definitely true since 13.1) and "webpack now does this automatically with zero config for App Router" (true in current docs, unclear exact version of introduction).

**How to avoid:** Don't spend time resolving the ambiguity. Add `transpilePackages: ['@berlin/shared', '@berlin/engine']` to `apps/web/next.config.ts` regardless — declaring a package that's already auto-transpiled is a documented no-op, never an error, and it removes any dependency on an undocumented version threshold. This matches CONTEXT.md's own risk framing and every prior research pass (`STACK.md`, `PITFALLS.md` §17) — treat it as required, not optional, and move on.

**Warning signs:** A task or PR description that says "confirmed transpilePackages isn't needed, removing it" — this is exactly the false confidence this pitfall describes; the safe default costs nothing to keep.

**Phase to address:** This phase, as part of the `next.config.ts` edit already in scope.

### Pitfall 2: `"engines": {"node": ">=22.0.0"}` doesn't pin what it sounds like it pins

**What goes wrong:** Per Vercel's own Node.js-versions documentation (fetched this session), the currently available major versions are **24.x (default), 22.x, 20.x**, and an open-ended semver range in `engines.node` resolves to the **newest** version satisfying the range — the docs' own example table shows `>=20.0.0` resolving to the latest **24.x**, not 20.x. `STACK.md`'s suggested `"engines": { "node": ">=22.0.0" }` would therefore resolve to Node 24 today, not Node 22 — technically satisfying "22+" but defeating the apparent intent of "pin to the tested version" that CONTEXT.md's risk list describes ("Node 22+ pinned").

**Why it happens:** `>=X` reads like "pin to X or use X as a floor," but Vercel's resolution picks the highest available major satisfying the range, the same way `npm install` would pick the highest satisfying version for a dependency — the mental model of "engines as a minimum-version warning" (its normal npm/Node semantics) doesn't match how Vercel uses the field to *select* a runtime.

**How to avoid:** If the goal is "run on exactly the Node 22.x line this project has only ever tested against," use a bounded value: `"engines": { "node": "22.x" }` (or `"^22.0.0"`, which per the same table maps to "latest 22.x"). Only use an open lower bound if running on whatever is newest is genuinely acceptable.

**Warning signs:** A deployed build succeeding on a Node major the project has never run its test suite against, discovered only by a subtle runtime behavior difference rather than a build failure.

**Phase to address:** This phase, when adding the `engines` field.

### Pitfall 3: D-04's build gate can be silently skipped by Vercel's own monorepo optimization

**What goes wrong:** Vercel's native "skip unaffected projects" feature (see Don't Hand-Roll) will skip the `apps/web` build entirely for a commit that changes only `packages/ai` or `apps/party` — packages `apps/web` doesn't depend on per its own `package.json` (`@berlin/engine`, `@berlin/shared` only). If such a commit breaks the `packages/ai` test suite, D-04's gate never runs, because the build it lives in never runs. This is a structural consequence of putting the CI gate inside one app's build rather than a real pipeline — which CONTEXT.md's "Deferred Ideas" section already accepts as the tradeoff for not building `.github/workflows` this phase.

**Why it happens:** D-04 attaches the quality gate to `apps/web`'s build lifecycle for expedience; Vercel's own build-skip logic is dependency-graph-aware at the *package.json dependency* level, not at the *"does this repo's overall test suite still pass"* level — the two systems have different scopes by design.

**How to avoid:** Nothing to fix in this phase — this is a known, accepted gap (see CONTEXT.md Deferred Ideas: "CI pipeline... a real CI pipeline is a separate concern"). Document it plainly so a future phase (or the user) doesn't mistake "the last few deploys built green" for "the whole test suite has been green on every commit."

**Warning signs:** A regression in `packages/ai` or `apps/party` ships to `main` and no Vercel build ever ran to catch it, because no `apps/web`/`packages/shared`/`packages/engine` file changed in that commit.

**Phase to address:** Document as an accepted limitation in this phase; do not attempt to fix (out of scope per CONTEXT.md).

### Pitfall 4: `pnpm test` accidentally treated as the E2E gate

**What goes wrong:** Root `package.json` has both `"test": "vitest run"` and `"test:e2e": "playwright test"` as separate scripts. D-04 says "typecheck and test" — it would be easy to broaden the Build Command to also run `pnpm test:e2e` "for extra confidence." Playwright's own config (`playwright.config.ts`) starts its `webServer` via `pnpm dev`, which runs **both** `next dev` and PartyKit's local dev server (`pnpm --parallel --filter web --filter party dev`) — this requires binding two long-lived local ports and does not correspond to anything meaningful inside an ephemeral Vercel build container, and would either hang the build or fail outright.

**Why it happens:** "Run the tests" sounds like it should include E2E once you're being thorough about a deploy gate — but `test` and `test:e2e` are deliberately separate root scripts for exactly this reason (unit/integration tests are hermetic; E2E needs live servers).

**How to avoid:** Confirmed by reading `vitest.config.ts`'s `include` globs directly — `packages/**/tests/**/*.test.ts`, `apps/**/tests/**/*.test.ts`, `apps/**/*.test.ts` — none of these match `apps/web/e2e/*.spec.ts` (different extension, different directory convention). `pnpm test` (vitest run) will not pick up Playwright specs by accident, and D-04's build command should stop at `pnpm -w run test`, never add `pnpm test:e2e`.

**Warning signs:** A Build Command that includes `playwright test` or `test:e2e`; a build that times out with no clear compile/type error in the log.

**Phase to address:** This phase, when writing the exact Build Command string.

### Pitfall 5 (inherited from `PITFALLS.md` §17, re-verified this session): CLI/auth availability for an automated agent

**What goes wrong:** Confirmed this session by direct probing: no `vercel` CLI, no `gh` CLI, and no `.vercel/` linked project exist in this environment. This is the exact, unchanged root cause RETROSPECTIVE.md names for why `apps/web` was never deployed in v1.0.

**How to avoid:** Treat project creation and GitHub-app authorization as a blocking, human-only checkpoint at the very start of this phase's plan — not a task an autonomous agent attempts and silently stalls on. Give the human a complete, copy-pasteable settings list (this document's Code Examples section) so the checkpoint is a five-minute dashboard task, not an open-ended "go figure out Vercel" instruction.

**Phase to address:** This phase, first task.

## Code Examples

### `apps/web/next.config.ts` — add `transpilePackages`

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@berlin/shared', '@berlin/engine'],
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
```
(Existing file read this session — `apps/web/next.config.ts:1-23` — confirms `transpilePackages` is currently absent and everything else shown here is unchanged.)

### Root `package.json` — pin Node 22.x

```json
{
  "packageManager": "pnpm@9.15.4",
  "engines": { "node": "22.x" }
}
```
(Root `package.json` read this session — `package.json:1-22` — confirms `packageManager` is already present and `engines` is currently absent.)

### `partysocket@1.3.0` protocol selection — verified from the installed package's own source

```js
// dist/index.js (unpacked from the published npm tarball for partysocket@1.3.0,
// this session — not paraphrased, not from a search result)
let host = rawHost.replace(/^(http|https|ws|wss):\/\//, "");
if (host.endsWith("/")) host = host.slice(0, -1);
...
const protocol =
  rawProtocol ||
  (host.startsWith("localhost:") ||
  host.startsWith("127.0.0.1:") ||
  host.startsWith("192.168.") ||
  host.startsWith("10.") ||
  (host.startsWith("172.") &&
    host.split(".")[1] >= "16" &&
    host.split(".")[1] <= "31") ||
  host.startsWith("[::ffff:7f00:1]:")
    ? defaultProtocol      // "ws" (or "http" for PartySocket.fetch)
    : `${defaultProtocol}s`);  // "wss" (or "https")
```
This is called with `defaultProtocol = "ws"` for the WebSocket path (`getWSOptions` → `getPartyInfo(partySocketOptions, "ws", ...)`) and `defaultProtocol = "http"` for `PartySocket.fetch` (the `_new` mint endpoint). **`window.location.protocol` never enters this decision at all.** For `berlin1988-party.maxmayermader.partykit.dev` (matches none of the loopback/private-IP prefixes), the result is `wss`/`https` automatically, from any page, HTTP or HTTPS. For the `127.0.0.1:1999` dev fallback, the result is `ws`/`http`, matching local dev exactly. `apps/web/lib/socket.ts:22-24`'s `partyHost()` returning a bare host string (no scheme) is therefore already correct for both environments with zero code change needed.

### `apps/party/src/room.ts` — confirms no CORS/origin change needed (already correct)

```ts
// apps/party/src/room.ts:39-46, 87-90 (read this session, verbatim)
/** Permissive for local dev, where apps/web and apps/party run on different
 *  ports/origins. This endpoint returns nothing sensitive — a fresh,
 *  unclaimed join code — so a permissive origin costs nothing here. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
...
   * apps/web (port 3000) and apps/party (port 1999) are different origins in
   * local dev, so this plain-HTTP endpoint needs explicit CORS headers —
   * WebSocket connections aren't subject to the same-origin policy, so
   * onMessage above needs none of this.
```
No change to `apps/party` is in scope for this phase, and none is needed — the existing permissive header on the one plain-HTTP endpoint already covers a new Vercel origin (preview or production), and the WebSocket path was never subject to CORS in the first place.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Hand-written git-diff Ignored Build Step for monorepo build skipping | Vercel's native "skip unaffected projects" (dependency-graph aware, on by default for qualifying GitHub-connected monorepos) | Documented as current platform behavior as of this session's fetch (2026) | This repo already qualifies (unique workspace package names, `pnpm-workspace.yaml` present, workspace dependencies declared via `workspace:*`) — no custom script needed unless the feature is later found insufficient |
| "Include source files outside of the Root Directory" as a manual toggle every project needs | On by default for any Vercel project created after **27 August 2020** | 2020 (long-standing, re-confirmed this session against current docs) | This project (created 2026) gets it automatically — the checkpoint should *verify*, not *configure* |
| Vercel default Node.js version | **24.x** is the platform default today (22.x and 20.x also selectable; 20.x is on a deprecation path per Vercel's own changelog) | Current as of this session's fetch | A project that never sets `engines.node` or the dashboard Node.js Version selector gets Node 24 today, not Node 22 — explicit pinning is now necessary to match this project's Node 22+ baseline, not just good practice |

**Deprecated/outdated:**
- The assumption (present in both `STACK.md` and `PITFALLS.md` §17) that `partysocket` derives `ws`/`wss` from the page's own protocol — corrected this session by reading the actual package source; it derives from the *host string's* shape instead. The practical outcome (bare host in, correct scheme out) is unchanged, but the *reasoning* documented in prior research was wrong and should not be repeated in the plan's task descriptions.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Vercel project created for this repo will be a brand-new project (not reusing/renaming an old one), so it gets the "include source outside Root Directory" default and today's Node-version defaults described above | State of the Art, Code Examples | If an existing/older Vercel project is reused instead, the include-outside-root toggle should be explicitly checked rather than assumed on |
| A2 | No `vercel.json` is required to satisfy DEPLOY-01/02 given a dashboard-driven Git-integration setup | Architecture Patterns | If the human setting up the project prefers config-as-code, a `vercel.json` mirroring the same settings (`buildCommand`, and optionally `git.deploymentEnabled`) is a drop-in alternative — not a correction, just an unexplored equivalent path |
| A3 | The "skip unaffected projects" native Vercel feature's requirements (unique workspace package `name` fields, dependencies declared via `workspace:*`) are met by this repo's current `package.json` files, based on the four `name` fields read this session (`@berlin/shared`, `@berlin/engine`, `web`, plus `party` inferred from existing docs, not re-read this session) | Don't Hand-Roll, Pitfall 3 | If `apps/party/package.json`'s `name` field collides with another workspace package (not directly re-checked this session), the native skip-detection could misbehave — cheap to verify during the plan's own setup task |

## Open Questions

1. **Does the installed `next@15.5.23` already auto-transpile workspace packages under webpack + App Router with zero config, or is that specifically a newer (16.x) behavior?**
   - What we know: Current Next.js docs (version banner 16.3.5 at fetch time) state this as present-tense platform behavior; the `transpilePackages` config option itself has existed since 13.1.
   - What's unclear: The exact version where "webpack does this automatically for App Router" behavior (as opposed to the always-available opt-in list) landed.
   - Recommendation: Irrelevant to the plan — add `transpilePackages` explicitly regardless (Pitfall 1). Do not spend a task investigating this further.

2. **Will the Vercel project actually be newly created, or might the maintainer link an existing-but-unused project from an earlier abandoned attempt?**
   - What we know: STATE.md and RETROSPECTIVE.md both describe `apps/web` as never having been deployed in this environment.
   - What's unclear: Whether the human performing the D-05 checkpoint has, independently of this codebase's history, already created a Vercel project for this repo outside of any session captured in `.planning/`.
   - Recommendation: The checkpoint instructions should tell the human to verify the "include source outside Root Directory" toggle explicitly (five-second check) rather than assume Assumption A1 holds, exactly as CONTEXT.md's D-05 already anticipates ("Modern Vercel often auto-enables this... but verify it explicitly rather than assume").

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `vercel` CLI | Programmatic project creation/linking, `vercel inspect`, `vercel rollback` | ✗ (confirmed absent this session) | — | Human performs project creation and configuration via the Vercel dashboard instead (D-05's explicit path) |
| `gh` CLI | Verifying GitHub-app authorization state from the command line | ✗ (confirmed absent this session) | — | Human verifies the GitHub App installation and repo authorization directly in the GitHub UI |
| `.vercel/` linked project | Any CLI-based deploy or inspect command | ✗ (confirmed absent this session) | — | Not needed if the Git-integration path (D-05) is used throughout; a linked project is only required for CLI workflows this phase deliberately avoids |
| GitHub repository | Vercel Git integration source | ✓ | `github.com/maxmayermader/Berlin1988` (confirmed via `git remote -v` this session) | — |
| Live PartyKit production host | The deployed site's realtime backend | ✓ | `berlin1988-party.maxmayermader.partykit.dev` — confirmed live this session (`POST /parties/match/_new` → HTTP 200) | — |

**Missing dependencies with no fallback:**
- None — every missing CLI has a documented dashboard-driven fallback that D-05 already chose deliberately.

**Missing dependencies with fallback:**
- `vercel` CLI, `gh` CLI, `.vercel/` linked project — all three are worked around by using Vercel's dashboard and Git integration exclusively, which is the locked setup path (D-05) regardless of CLI availability.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (unit/integration), Playwright 1.62.1 (E2E, local-dev only — not part of this phase's deploy gate) |
| Config file | `vitest.config.ts` (repo root) — confirmed by direct read this session |
| Quick run command | `pnpm -w run test` (or `pnpm test` from repo root) |
| Full suite command | Same — the root `vitest.config.ts` already covers `packages/**` and `apps/**` in one invocation; there is no separate "quick" vs "full" split in this repo today |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | Deployed URL reachable, connects to production PartyKit (not localhost) | manual/smoke (D-07) | `curl -s -o /dev/null -w '%{http_code}' https://<deployment-url>/` for reachability; a browser-driven check (or a headless Playwright run pointed at the deployed URL rather than local dev) for "connects to production, not localhost" | ❌ — no existing test targets a deployed URL; this is new, human/agent-run smoke-test scope per D-07, not a `tests/` file |
| DEPLOY-02 | Merge to `main` triggers an automatic redeploy | manual/smoke (D-07) | Push a trivial commit to `main` post-setup and confirm a new deployment appears in the Vercel dashboard/via the deployed URL's changed content | ❌ — inherently a one-time platform-behavior confirmation, not a repeatable automated test |
| D-04 (build gate, not a REQ-ID but locked) | A commit that breaks types or tests fails the deploy | build-time gate | `pnpm -w run typecheck && pnpm -w run test` as the Vercel Build Command prefix | ✅ — both scripts already exist and pass today (69+ tests, engine/AI phases green per CLAUDE.md's own status line) |

### Sampling Rate

- **Per task commit:** N/A — this phase makes two file edits (`next.config.ts`, `package.json`) plus dashboard configuration; the existing `pnpm typecheck`/`pnpm test` already run locally before any commit per repo convention.
- **Per wave merge:** Confirm the Vercel build itself goes green on the first real deployment attempt — this **is** the phase's actual test, run by the platform.
- **Phase gate:** A live, reachable `*.vercel.app` URL, confirmed via `curl` (or equivalent) returning a 2xx, plus the D-07 smoke test (create a game, confirm the socket target is the production PartyKit host, second browser joins the same lobby).

### Wave 0 Gaps

- None — no new test file is needed. `pnpm typecheck`/`pnpm test` already exist and already pass; the "test" this phase adds is the Vercel build itself succeeding for the first time, which cannot be pre-authored as a `tests/` file.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Build-time gate (D-04) enforces that a broken build/type/test state never reaches production — a deployment-pipeline integrity control, not an application-code one |
| V2 Authentication | no | This phase adds no auth surface; the project has no accounts (per PROJECT.md) |
| V4 Access Control | no | No new access-control surface — Vercel project/dashboard access itself is controlled by the maintainer's own Vercel/GitHub account, outside this phase's scope |
| V5 Input Validation | no (unchanged) | Already enforced at the `apps/party` Zod boundary (`clientMessageSchema`) — untouched by this phase |
| V6 Cryptography | no | TLS termination (`wss://`/`https://`) is handled entirely by Vercel and Cloudflare's platforms; this phase configures nothing cryptographic |
| V14 Configuration | yes | `NEXT_PUBLIC_PARTYKIT_HOST` is a non-secret (client-visible by design) configuration value; the standard control is scoping it correctly per Vercel environment (Production/Preview) and never treating it as a secret, since `NEXT_PUBLIC_*` variables are inlined into the public client bundle by definition |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A preview deployment silently missing `NEXT_PUBLIC_PARTYKIT_HOST`, falling through to `127.0.0.1:1999` (D-02's accepted failure mode) | Denial of Service (self-inflicted, not adversarial) | None added by design (D-02) — the user explicitly chose to accept this failure mode over adding a build-time guard; not a security vulnerability, a known UX gap |
| Treating a Vercel preview URL as private because it "looks" unguessable | Information Disclosure | Not applicable here — D-01 already accepts that preview lobbies are fully public and visible in the open-lobby list; no additional protection was requested or is in scope |
| A public `Access-Control-Allow-Origin: '*'` on the `_new` mint endpoint being mistaken for an application security boundary | Spoofing/Tampering (misunderstanding, not a real gap) | Already correctly scoped in `room.ts`'s own comment: the endpoint returns nothing sensitive (a fresh, unclaimed join code), so a permissive origin costs nothing — do not "fix" this as part of this phase |

## Sources

### Primary (HIGH confidence — read directly this session)

- `apps/web/lib/socket.ts` — `partyHost()`, bare-host env var read, `127.0.0.1:1999` fallback
- `apps/web/next.config.ts` — confirmed `transpilePackages` absent
- `package.json` (root) — confirmed `packageManager` present, `engines` absent, scripts `typecheck`/`test`/`test:e2e` distinct
- `apps/web/package.json` — confirmed `build`: `next build`, dependency list (`@berlin/engine`, `@berlin/shared`, `partysocket@1.3.0`, no `@berlin/ai`)
- `packages/shared/package.json`, `packages/engine/package.json` — confirmed `"main": "./src/index.ts"`, no build step
- `pnpm-workspace.yaml` — confirmed `packages/*`, `apps/*`
- `vitest.config.ts` (root) — confirmed `include` globs never match `apps/web/e2e/*.spec.ts`
- `playwright.config.ts` (root) — confirmed `webServer.command: 'pnpm dev'` starts both `next dev` and PartyKit dev, unsuitable for a Vercel build container
- `tsconfig.json` (root) — confirmed project references cover `shared`, `engine`, `ai`, `party`, `party/scripts`, `web`
- `apps/party/src/room.ts:36-101` — confirmed CORS headers on the `_new` HTTP endpoint only, and the comment documenting WebSocket exemption from CORS
- `apps/party/partykit.json` — confirmed live party name `berlin1988-party`, parties `match`/`directory`
- `partysocket@1.3.0` npm tarball, unpacked and read this session (`dist/index.js`, `getPartyInfo`/`getWSOptions`) — protocol-selection logic, verbatim quoted in Code Examples
- Direct execution this session: `pnpm -w run typecheck --help` from `apps/web`, confirming the root script resolves and runs from the root working directory
- Direct probe this session: `vercel`/`gh` CLI absence, no `.vercel/` directory, `git remote -v` → `github.com/maxmayermader/Berlin1988`, live `curl` to the production PartyKit host returning HTTP 200

### Secondary (MEDIUM confidence — official docs fetched this session)

- [Next.js — transpilePackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages) — current behavior, App Router auto-transpile claim, version history since 13.1
- [Vercel — Using Monorepos](https://vercel.com/docs/monorepos) — skip-unaffected-projects requirements and mechanics, Ignored Build Step interaction
- [Vercel — Monorepos FAQ](https://vercel.com/docs/monorepos/monorepo-faq) — exact "Include source files outside of the Root Directory in the Build Step" wording and its on-by-default-since-2020-08-27 status
- [Vercel — Configuring a Build](https://vercel.com/docs/builds/configure-a-build) — Root Directory access restrictions, Build/Install Command override mechanics
- [Vercel — Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) — current default (24.x) and available majors (24.x/22.x/20.x), `engines.node` range-resolution table
- [Vercel — Git Configuration](https://vercel.com/docs/project-configuration/git-configuration) — `git.deploymentEnabled`, `github.autoAlias`, `github.autoJobCancelation` exact `vercel.json` schema
- [Vercel — Ignored Build Step KB guide](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel) — exit-code semantics (0 = skip, non-zero = build)
- [Vercel — Instant Rollback](https://vercel.com/docs/instant-rollback), [Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment) — D-03's mechanics, plan-eligibility note (Hobby vs. Pro)
- [Vercel — Framework environment variables](https://vercel.com/docs/environment-variables/framework-environment-variables) (already cited in `STACK.md`, re-confirmed via this session's search) — `NEXT_PUBLIC_*` build-time inlining, per-environment scoping

### Tertiary (LOW confidence — WebSearch synthesis, not independently confirmed against a primary source this session)

- The claim that "automatic transpilation of workspace packages for App Router with webpack was introduced starting with Next.js 13.1" — this conflates the `transpilePackages` config option's introduction (13.1, confirmed) with a specific claim about zero-config automatic behavior that the primary doc states in the present tense but does not date. Treated as an Open Question, not a fact, in this document.

## Metadata

**Confidence breakdown:**
- Vercel monorepo/env-var mechanics: HIGH — cross-checked against three current official Vercel doc pages fetched this session, consistent with each other
- `partysocket`/CORS behavior: HIGH — verified by reading the actual installed package source and this repo's own `room.ts`, not inferred from docs or search
- Node version pinning specifics: HIGH — direct quote from Vercel's own version-resolution table
- Exact Next.js version threshold for auto-transpile-without-config: LOW — left as an explicit Open Question rather than asserted

**Research date:** 2026-09-18
**Valid until:** 30 days for the Vercel-platform-specific claims (Node version defaults and monorepo feature defaults are the kind of thing Vercel changes without a major version bump); the `partysocket`/`room.ts` source-verified claims are stable until either package is upgraded.
