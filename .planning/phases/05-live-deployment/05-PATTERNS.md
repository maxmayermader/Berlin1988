# Phase 5: Live Deployment - Pattern Map

**Mapped:** 2026-09-18
**Files analyzed:** 2 (both modified, no new files)
**Analogs found:** 1 exact self-reference / 1 no-analog

## File Classification

This is a config/deployment phase, not a feature phase. There are exactly two code files in scope, both edits to existing files, no new files. There is no controller/service/component work, so most of the standard classification table does not apply.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/next.config.ts` | config | N/A (build-time config) | itself (add one key to existing object) | exact — this is an in-place edit, not a new pattern to borrow |
| `package.json` (root) | config | N/A (build-time config) | itself (add one key to existing object) | exact — same |

No `vercel.json` is being created (CONTEXT.md/RESEARCH.md both treat the Vercel project as dashboard-configured, not config-as-code) and no verification script is being introduced by RESEARCH.md's own recommendation — the "test" for this phase is the Vercel build succeeding, not a new file under `apps/party/scripts/` or `apps/web/`. If the planner later decides a smoke-test script is worth authoring for D-07, `apps/party/scripts/measure-4p-timing.ts` is the correct analog for "standalone script run via tsx outside the test suite" (see Shared Patterns below), but nothing in CONTEXT.md or RESEARCH.md commits to that file existing.

## Pattern Assignments

### `apps/web/next.config.ts` (config)

**Analog:** itself — current file content, read in full (23 lines)

Full current contents:
```ts
import type { NextConfig } from 'next';

/**
 * apps/web is a client of the room server only — it holds no engine
 * authority. Nothing here should ever reach into apps/party.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The codebase-wide convention is explicit `.js` extensions on relative
  // imports (verbatimModuleSyntax, matching how packages/* are consumed as
  // real ESM). tsc's Bundler resolution already maps `./foo.js` to
  // `./foo.ts`/`./foo.tsx`; webpack needs the same alias told to it
  // explicitly, or a `.js`-suffixed import to a `.tsx` component fails to
  // resolve in `next dev`.
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
```

**Change required:** add one key, `transpilePackages: ['@berlin/shared', '@berlin/engine']`, to the `nextConfig` object, matching the existing comment style (explain *why*, not *what* — see RESEARCH.md Pitfall 1 for the rationale to put in the comment: this is a safe no-op if webpack already auto-transpiles, added regardless to remove ambiguity). Keep the existing `reactStrictMode` and `webpack()` keys byte-for-byte unchanged; this is an additive edit to one object literal, not a rewrite.

**Comment convention to match** (per this file's own precedent and `apps/web/CLAUDE.md`): every non-obvious config key gets a `//` block above it explaining the *why*. The existing `webpack()` comment is the template — state the problem (`.js` imports need extensionAlias / workspace packages need transpiling), then the mechanism.

---

### `package.json` (root)

**Analog:** itself — current file content, read in full (23 lines)

Full current contents:
```json
{
  "name": "berlin1988",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "typecheck": "tsc --build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "sim": "tsx packages/ai/sim/run.ts",
    "dev": "pnpm --parallel --filter web --filter party dev",
    "measure:timing": "tsx apps/party/scripts/measure-4p-timing.ts"
  },
  "devDependencies": { ... }
}
```

**Change required:** add a top-level `"engines": { "node": "22.x" }` field, placed after `"packageManager"` (they're the same category of platform-pinning metadata — keep them adjacent). Do **not** add or modify any `scripts` entry — D-04's build gate (`pnpm -w run typecheck && pnpm -w run test && pnpm run build`) is a Vercel dashboard Build Command override, not a new root script, per RESEARCH.md's explicit recommendation and CONTEXT.md's "this is a build-command decision, not a CI pipeline."

**Do not touch:** `scripts.test:e2e` (Playwright) must never be referenced by the Vercel build command — see RESEARCH.md Pitfall 4. `scripts.test` (`vitest run`) is the only test script the build gate should invoke.

---

## Shared Patterns

### The single env-var read stays exactly as-is

**Source:** `apps/web/lib/socket.ts:22-24`
```ts
export function partyHost(): string {
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? '127.0.0.1:1999';
}
```
**Apply to:** Nothing — this file is explicitly NOT modified by this phase (D-02 locked decision: keep the fallback, no build-time guard, no error screen). Flagging it here only so the planner does not accidentally assign a plan/task to it. Every other function in `socket.ts` (`mintJoinCode`, `handshake`, `useRoomSocket`, `submitOrder`) calls `partyHost()` and needs zero changes — they all already resolve `wss://` correctly for any non-loopback host per RESEARCH.md's verified `partysocket` source read.

### Standalone tsx script pattern (only relevant if a smoke-test script is later authored)

**Source:** `apps/party/scripts/measure-4p-timing.ts` (referenced by root `package.json`'s `measure:timing` script: `tsx apps/party/scripts/measure-4p-timing.ts`)
**Apply to:** A prospective D-07 smoke-test script, if the planner chooses to author one rather than running the smoke test manually/via curl. Not committed to by CONTEXT.md or RESEARCH.md — RESEARCH.md's own Validation Architecture section marks DEPLOY-01/DEPLOY-02 verification as "manual/smoke," not a new `tests/` file, and explicitly says "no new test file is needed."
**Pattern to copy if used:** a root `package.json` script entry of the form `"<name>": "tsx <path-to-script>.ts"`, mirroring `measure:timing`'s exact invocation style — no build step, run directly via `tsx`, executed by a human or agent from the repo root, not part of `pnpm test`.

### Build-time config comment style

**Source:** `apps/web/next.config.ts`'s existing `webpack()` comment (see above)
**Apply to:** Both files in scope. Every added config key should carry a comment stating the specific failure mode it prevents (per this codebase's established "document the why" convention from `.claude/CLAUDE.md`), not just what the key does. For `transpilePackages`, the "why" is Pitfall 1 (ambiguous auto-transpile behavior, safe no-op either way). For `engines.node`, the "why" is Pitfall 2 (`>=22.0.0` resolves to Vercel's newest major, not 22 — must use the bounded `22.x` form).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Vercel project settings (Root Directory, env vars, Build Command) | config | N/A | Not a repo file at all — lives entirely in the Vercel dashboard per D-05. RESEARCH.md explicitly recommends against adding a `vercel.json` this phase (A2: dashboard-driven Git integration is sufficient and matches D-05's intent). No analog applies because there is no committed artifact to pattern-match against. |
| A D-07 smoke-test script/checklist | test | manual/smoke | No existing file in this repo runs a check against a *deployed* URL (everything today targets local dev or in-process state). RESEARCH.md's own Validation Architecture table marks this "❌ — inherently a one-time platform-behavior confirmation, not a repeatable automated test." If the planner wants a script anyway, see the `measure-4p-timing.ts` shared pattern above as the closest structural precedent (standalone tsx script, no test-runner integration). |

## Metadata

**Analog search scope:** `apps/web/next.config.ts`, `apps/web/lib/socket.ts`, root `package.json`, `apps/party/scripts/` (for script-authoring precedent), `apps/party/src/room.ts` (read only to confirm no changes needed there, per RESEARCH.md)
**Files scanned:** 5
**Pattern extraction date:** 2026-09-18
**Note:** This phase is unusually analog-poor by design — RESEARCH.md's own framing is "the actual work is dashboard configuration plus two small file edits," and both edits are in-place additions to files this agent read in full above, not adaptations of a different file's pattern. Forcing a cross-file analog (e.g., pointing at some other config file in the repo) would be padding, not guidance — there is no other `next.config.ts` or root `package.json` to compare against, and both target files are small enough that "the analog is the current file, read line 1 to EOF" is the honest answer.
