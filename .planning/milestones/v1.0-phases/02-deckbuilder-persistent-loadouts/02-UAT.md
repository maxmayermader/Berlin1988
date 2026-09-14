---
status: testing
phase: 02-deckbuilder-persistent-loadouts
source: [02-VERIFICATION.md]
started: 2026-08-29T23:59:00Z
updated: 2026-08-29T23:59:00Z
---

## Current Test

number: 1
name: A refused in-lobby save keeps the editor open
expected: |
  In the lobby, open the deckbuilder editor, force an illegal SUBMIT_LOADOUT payload past the
  client's disable-until-legal Save gate (e.g. via browser devtools or a direct store/wire
  injection), and observe the client's reaction to the room's LOADOUT_REJECTED reply. The error
  line "Couldn't save your loadout — {server message}. Try again." should render, and the editor
  should stay open (not silently close or discard the player's in-progress edits).
awaiting: user response

## Tests

### 1. A refused in-lobby save keeps the editor open
expected: LOADOUT_REJECTED renders the error copy and the editor stays open — verified by code inspection of `awaitingSaveCloseRef` in apps/web/app/lobby/[code]/page.tsx (closes only on 'accepted', stays open on 'rejected'), but D-03's own client-side legality gate makes this path unreachable through the UI in any automated test.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

This is a structurally-unreachable-by-design automation gap, not a functional defect: D-03's
client-side gate (disable Save until legal) means no Playwright spec can produce a genuine
LOADOUT_REJECTED reply through the normal UI. The code is correct by inspection. Closing this
item requires a human to force the illegal payload past the client gate once (e.g. via browser
devtools) and confirm the editor's actual on-screen behavior. Run `/gsd-verify-work 02` after
testing.
