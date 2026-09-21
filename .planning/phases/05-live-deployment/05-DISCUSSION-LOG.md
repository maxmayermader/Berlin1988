# Phase 5: Live Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 5-live-deployment
**Areas discussed:** Preview deployments

**Areas offered but not selected:** Setup path and handoff, URL and discoverability, What counts as done

---

## Preview deployments — branch deploy policy

Research shown before the question: Vercel separates Development/Preview/Production env vars; preview URLs are public by default unless deployment protection is on; variables can be branch-scoped; the classic failure is an env-var mismatch pointing a preview at the wrong backend.

| Option | Description | Selected |
|--------|-------------|----------|
| Only main deploys | Previews off entirely. One live site, no stray lobbies in the public list | |
| Previews on, locked to you | Every branch gets a URL, but Vercel deployment protection limits access to the owner's account. Plan-dependent | |
| Previews on, open | Every branch gets a public URL against the live server; preview lobbies mix into the public list | ✓ |

**User's choice:** Previews on, open
**Notes:** Accepted the shared-lobby side effect. Staging PartyKit (DEPLOY-05) stays deferred, so previews point at production.

---

## Preview deployments — missing `NEXT_PUBLIC_PARTYKIT_HOST`

| Option | Description | Selected |
|--------|-------------|----------|
| Fail the build | Refuse to build unless the host is set; a misconfigured deploy never reaches anyone | |
| Show a clear error in the app | Build succeeds, site reports it isn't configured instead of hanging | |
| Keep today's behavior | Silent `127.0.0.1:1999` fallback everywhere | ✓ |

**User's choice:** Keep today's behavior
**Notes:** Chosen after being shown the failure mode: a deployed build missing the variable connects to nothing and fails silently, and the build gate below cannot catch it. The interaction with open previews was flagged again after the answers; the user declined to revisit it.

---

## Preview deployments — rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Instant rollback in Vercel | Promote the previous deployment from the dashboard; repo untouched | ✓ |
| Revert the commit | Fix forward through git and let auto-deploy replace it | |
| Both, written down | Roll back first, then revert so the repo matches | |

**User's choice:** Instant rollback in Vercel
**Notes:** No revert tooling or documented dual procedure wanted.

---

## Preview deployments — build gate

| Option | Description | Selected |
|--------|-------------|----------|
| Typecheck and tests first | `pnpm typecheck` and `pnpm test` before `next build`; broken commits fail the deploy | ✓ |
| Typecheck only | Catches type and import errors without the full suite | |
| Just build | Fastest deploys; tests stay local | |

**User's choice:** Typecheck and tests first
**Notes:** Slower builds accepted (580 tests). Scoped as a build command, not a CI pipeline.

---

## Claude's Discretion

Three offered areas the user chose not to discuss; defaults recorded as D-05 to D-07 in CONTEXT.md:

- **Setup path and handoff** — Vercel Git integration over CLI-only linking, with an explicit human checkpoint for project creation and GitHub authorization.
- **URL and discoverability** — default `*.vercel.app` URL, no custom domain, no search-engine blocking.
- **What counts as done** — agent smoke test plus a second browser session; the real multi-person session stays Phase 10's DEPLOY-03 gate.

## Deferred Ideas

- Staging PartyKit deployment (DEPLOY-05) — would remove the shared-lobby side effect of open previews.
- CI pipeline in `.github/workflows` — the build gate covers this phase's need.
- Custom domain — user's purchase decision, available any time.
- Correcting the stale staging-preview line in `.planning/codebase/INTEGRATIONS.md`.
