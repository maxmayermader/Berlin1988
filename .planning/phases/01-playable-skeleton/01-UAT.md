---
status: testing
phase: 01-playable-skeleton
source: [01-VERIFICATION.md]
started: 2026-08-27T20:05:00Z
updated: 2026-08-27T20:05:00Z
---

## Current Test

number: 1
name: Hibernation survival across a real deployed room
expected: |
  Deploy apps/web to Vercel (pointed at the already-live berlin1988-party.maxmayermader.partykit.dev)
  and set NEXT_PUBLIC_PARTYKIT_HOST accordingly. Open a match in two browser tabs, idle well past the
  round deadline / hibernation window, then send a message from one tab (e.g. submit an order).
  Both tabs should continue the same match — no reset, no fresh room — proving the Durable Object
  actually rehydrated from storage after a real hibernation cycle.
awaiting: user response

## Tests

### 1. Hibernation survival across a real deployed room
expected: Both tabs continue the same match state after the idle period — same round, same agent state, no reset.
result: [pending]

### 2. A full human-played match through the deployed stack
expected: A person plays a full match end to end through the deployed apps/web + apps/party stack against AI auto-fill bots, the match completes to a result screen, and the player's subjective read on bot timing/pacing is captured.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

Both tests are blocked on a prerequisite outside either test itself: `apps/web` has never been deployed
to Vercel in this project (no `vercel` CLI, no linked `.vercel/` project, no `vercel.json` — confirmed
absent by 01-VERIFICATION.md). Deploying is an account-level action only the user can perform. Deferred
by explicit user decision on 2026-08-27 rather than blocking Phase 01 or the rest of the roadmap — tracked
here so it isn't silently dropped. Run `/gsd-verify-work 01` after deploying to close these out.
