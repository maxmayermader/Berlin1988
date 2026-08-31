# Phase 2: Deckbuilder & Persistent Loadouts - Pattern Map

**Mapped:** 2026-08-27
**Files analyzed:** 13 (new + modified)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/web/lib/loadoutStore.ts` | store (Zustand) | CRUD (in-memory draft) + file-I/O (localStorage) | `apps/web/lib/identity.ts` (storage) + `apps/web/lib/uiStore.ts` (store shape) | exact (composite) |
| `apps/web/components/deck/Deckbuilder.tsx` | component (shell) | request-response (props/callbacks) | `apps/web/components/orders/OrderComposer.tsx` | role-match |
| `apps/web/components/deck/CardGrid.tsx` | component | transform (render grouped data) | `apps/web/components/orders/OrderComposer.tsx` (sub-render pattern) | partial-match |
| `apps/web/components/deck/LegalityMeter.tsx` | component | transform (derived validation display) | `apps/web/components/orders/OrderComposer.tsx` (status/rejection rendering) | partial-match |
| `apps/web/components/deck/PresetPicker.tsx` | component | request-response (button callbacks) | `apps/web/components/lobby/SeatList.tsx` / `Button` usage in `OrderComposer.tsx` | partial-match |
| `apps/web/app/deck/page.tsx` | route (client component) | CRUD (localStorage-only, no socket) | `apps/web/app/lobby/[code]/page.tsx` (minus socket) | role-match |
| `apps/web/app/lobby/[code]/page.tsx` (MODIFIED) | route (client component) | request-response (adds SUBMIT_LOADOUT + SET_READY) | itself (Phase 1 version) | exact |
| `apps/web/lib/socket.ts` (MODIFIED) | service (network chokepoint) | event-driven (send/receive) | itself (`submitOrder` function as the pattern for a new `submitLoadout` function) | exact |
| `packages/shared/src/protocol.ts` (MODIFIED) | config/schema | request-response (wire schema) | itself (`SUBMIT_ORDER` member of `clientMessageSchema`) | exact |
| `apps/party/src/state.ts` (MODIFIED) | model | CRUD (RoomSeat field + reducer fn) | itself (`setReady`/`setCodename` reducer functions, `RoomSeat` interface) | exact |
| `apps/party/src/handlers.ts` (MODIFIED) | controller/handler | request-response | itself (`handleSubmitOrder`, `handleSetReady`) | exact |
| `apps/party/src/settings.ts` (MODIFIED) | service (match config builder) | transform (build config from RoomState) | itself (`startMatch`'s `PHANTOM` overwrite loop) | exact |
| `apps/party/tests/botfill.test.ts` (MODIFIED) | test | — | itself (existing "every loadout is PHANTOM" assertion) | exact |

## Pattern Assignments

### `apps/web/lib/loadoutStore.ts` (store, CRUD + file-I/O)

**Analog 1 (persistence):** `apps/web/lib/identity.ts`

**StorageLike + lazy browser guard** (lines 67-78):
```typescript
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}
```

**Load-or-generate with corrupt-JSON discard** (lines 120-140):
```typescript
const STORAGE_KEY = 'berlin1988.identity'; // -> use 'berlin1988.loadout'

export function loadIdentity(storage: StorageLike | null = browserStorage()): Identity {
  if (storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isValidIdentity(parsed)) return parsed;
      } catch {
        // corrupt or non-JSON value — fall through and regenerate
      }
    }
  }
  const fresh = freshIdentity(); // -> [...PHANTOM] per D-01
  saveIdentity(fresh, storage);
  return fresh;
}

export function saveIdentity(identity: Identity, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(identity));
}
```
Apply this exact shape: `loadLoadout(storage = browserStorage())` returns `CardId[10]`, falling back to `[...PHANTOM]` (imported from `@berlin/engine`) on missing/corrupt storage; `saveLoadout(loadout, storage)` writes on every change (D-01: "freely edited and overwritten in place on every change" — no debounce, no explicit save button on the home route).

**Analog 2 (store shape):** `apps/web/lib/uiStore.ts` / `apps/web/lib/matchStore.ts`

**Zustand store skeleton with per-key setters** (uiStore.ts lines 24-77, matchStore.ts lines 34-75):
```typescript
interface UiStore {
  readonly draftByAgent: Readonly<Record<string, OrderDraft>>;
  setDraft: (agentId: AgentId, draft: OrderDraft) => void;
  clearAllDrafts: () => void;
}
export const useUiStore = create<UiStore>((set, get) => ({
  draftByAgent: {},
  setDraft: (agentId, draft) => set((s) => ({ draftByAgent: { ...s.draftByAgent, [agentId as string]: draft } })),
  clearAllDrafts: () => set({ draftByAgent: {} }),
}));
```
`loadoutStore.ts` should follow this: `{ loadout: CardId[] }` initialized via a lazy `loadLoadout()` call *inside* the store creator is still SSR-risky — per Pitfall 1 in RESEARCH.md, the safer pattern is `useState(() => loadLoadout())` at the *callsite* (see `apps/web/app/lobby/[code]/page.tsx:20`, `const [identity] = useState(() => loadIdentity());`) OR a Zustand store whose initial `loadout` is `[]`/`[...PHANTOM]` literal and a `hydrate()` action called once in a `useEffect` on mount. Do not call `loadLoadout()` at `create<T>((set) => ({...}))` module-eval time.

**Derived legality — do NOT store violations in Zustand.** Per RESEARCH.md Pattern 2, call `validateLoadout(loadout, DEFAULT_RULESET)` and `budgetPointsOf(loadout)` from `@berlin/engine` inside a selector/hook (e.g. `useLoadoutLegality(loadout)`), recomputed every render — mirrors how `OrderComposer.tsx` calls `legalOrders(view, activeAgentId, prefix)` live rather than caching legal-move sets in a store (`apps/web/components/orders/OrderComposer.tsx:51-52`).

Store actions needed: `add(cardId)`, `remove(cardId)`, `loadPreset(preset: Loadout)` (replaces the whole array — D-02 reset, not merge), each calling `saveLoadout()` as a side effect after `set(...)`.

---

### `apps/web/components/deck/Deckbuilder.tsx` (component, request-response)

**Analog:** `apps/web/components/orders/OrderComposer.tsx`

**Props-in/callbacks-out shell, no network/store access inside** (lines 1-21):
```typescript
'use client';
import type { Action, AgentId, PlayerView } from '@berlin/shared';
import { legalOrders } from '@berlin/engine';
import type { OrderStatus } from '../../lib/matchStore.js';

export interface OrderComposerProps {
  view: PlayerView;
  selectedAgentId: AgentId | null;
  onSelectAgent: (agentId: AgentId) => void;
  draft: OrderDraft;
  orderStatus: OrderStatus | undefined;
  onAssign: (slotIndex: number, action: Action) => void;
  onClearSlot: (slotIndex: number) => void;
  onSubmit: () => void;
}
```
`Deckbuilder` should take `loadout: CardId[]`, `onAdd(cardId)`, `onRemove(cardId)`, `onLoadPreset(preset)`, and (lobby-only) `onSave()`/`saveStatus` — composing `CardGrid` + `LegalityMeter` + `PresetPicker` internally, performing zero localStorage/socket I/O itself, per `apps/web/components/CLAUDE.md`: "Nothing here fetches."

**Submit button gating pattern** (lines 77-90):
```typescript
<Button onClick={onSubmit} pending={orderStatus?.state === 'pending'} disabled={!isSubmittable(draft) || locked}>
  Submit Orders
</Button>
{orderStatus?.state === 'accepted' && (
  <p className="text-sm font-semibold text-[#2563eb]">Order locked in.</p>
)}
{orderStatus?.state === 'rejected' && orderStatus.message && (
  <p className="text-sm text-[#dc2626]">{orderRejectionText(orderStatus.message)}</p>
)}
```
Apply directly to the "Save Loadout" CTA (lobby only, per UI-SPEC copy contract): `disabled={violations.length > 0 || pending}`, reusing `Button`'s `pending` prop, and a `text-[#dc2626]` rejection line for a `SUBMIT_LOADOUT` reject reply, matching UI-SPEC's "Couldn't save your loadout — {server message}. Try again."

---

### `apps/web/components/deck/LegalityMeter.tsx` (component, transform)

**Analog:** `packages/engine/src/loadout.ts` (data source) + `OrderComposer.tsx`'s rejection-text rendering (visual pattern)

Call `validateLoadout(loadout, DEFAULT_RULESET)` → `LoadoutViolation[]` with `{ code, message }`, and `budgetPointsOf(loadout)` → `number`. Render `message` directly (already human-readable engine copy) — do not re-derive text from `code` client-side. Violation codes: `'WRONG_SIZE' | 'UNKNOWN_CARD' | 'ICON_LIMIT' | 'TOO_FEW_COLORS' | 'OVER_BUDGET'`.

---

### `apps/web/components/deck/PresetPicker.tsx` (component, request-response)

**Analog:** `apps/web/components/lobby/SeatList.tsx` + `Button` primitive usage pattern (ghost buttons, `apps/web/components/ui/Button.js`)

Four fixed buttons calling `onLoadPreset(STARTER_LOADOUTS.PHANTOM | HUNTER | OLIGARCH | SPIDER)`. Per UI-SPEC, wrap each click in `window.confirm('Load {Name}? This replaces your current loadout.')` before invoking the callback — no new confirm-dialog primitive needed.

---

### `apps/web/app/deck/page.tsx` (route, client component)

**Analog:** `apps/web/app/lobby/[code]/page.tsx` (Phase 1, current version — minus the socket)

**Client-component shell with lazy-loaded local state** (lines 1-20):
```typescript
'use client';
import { useState } from 'react';
import { loadIdentity } from '../../../lib/identity.js';

export default function LobbyPage() {
  const [identity] = useState(() => loadIdentity());
  // ...
}
```
`/deck/page.tsx` mirrors this: `'use client'`, reads/writes `loadoutStore` directly (hydrate in a `useEffect` per the SSR-safety note above), renders `<Deckbuilder>` with store-bound props/callbacks, and needs **no socket connection at all** — this route never touches `apps/web/lib/socket.ts`.

---

### `apps/web/app/lobby/[code]/page.tsx` (MODIFIED — embeds Deckbuilder)

**Analog:** itself, current file (full file already read — 73 lines)

**Existing send/toggle pattern to extend** (lines 38-49):
```typescript
function send(message: ClientMessage) {
  socket.send(JSON.stringify(clientMessageSchema.parse(message)));
}
function toggleReady() {
  if (!mySeat) return;
  send({ type: 'SET_READY', ready: !mySeat.ready });
}
```
Add: an `editingLoadout` boolean piece of local state; an "Edit Loadout" button that (a) sets `editingLoadout = true` and (b) calls `send({ type: 'SET_READY', ready: false })` per D-05, reusing the exact `send()` helper already in this file — no new socket plumbing needed for the ready-clear half. On close/save, call the new `submitLoadout(socket, loadout)` helper from `lib/socket.ts` (see below) and set `editingLoadout = false`. Conditionally render `<Deckbuilder>` in place of `<SeatList>`/`<CodenameEditor>` when `editingLoadout` is true — per RESEARCH.md Open Question 2's recommendation, in-place conditional rendering (no route change) to keep `useRoomSocket`'s single connection alive.

---

### `apps/web/lib/socket.ts` (MODIFIED — add `submitLoadout`)

**Analog:** itself — `submitOrder()` (lines 173-189) is the exact pattern for a new `submitLoadout()`

```typescript
export function submitOrder(
  socket: PartySocket,
  round: number,
  agentId: string,
  actions: readonly Action[],
  buySilencers?: number,
): void {
  const message: ClientMessage = {
    type: 'SUBMIT_ORDER',
    round,
    agentId,
    actions: [...actions],
    ...(buySilencers !== undefined ? { buySilencers } : {}),
  };
  useMatchStore.getState().setOrderStatus(agentId, { state: 'pending' });
  socket.send(JSON.stringify(clientMessageSchema.parse(message)));
}
```
New `submitLoadout(socket, cards: CardId[]): void` follows the same shape — build a `{ type: 'SUBMIT_LOADOUT', cards }` `ClientMessage`, `clientMessageSchema.parse()` it before `socket.send()` (never trust an unparsed payload onto the wire, matching every existing send in this file). No matching store status field exists yet for loadout submission — either add a small `loadoutSubmitStatus` piece to `loadoutStore.ts` (mirrors `orderStatus`'s `'idle'|'pending'|'accepted'|'rejected'` shape from `matchStore.ts` lines 8-11) or handle it as local component state in the lobby page; either is consistent with `apps/web/lib/CLAUDE.md` rule 4 (optimistic preview is advisory).

Also extend the inbound `onMessage` handler (lines 115-161) with a branch for a `SUBMIT_LOADOUT` ack/reject reply if one is added to `ServerMessage` (see Open Questions in RESEARCH.md — simplest option needs no new server message at all, just relies on `startMatch`'s own re-validation).

---

### `packages/shared/src/protocol.ts` (MODIFIED — add `SUBMIT_LOADOUT`)

**Analog:** itself — the `SUBMIT_ORDER` member (lines 82-88) and the `cardIdOnWire` transform (line 27) already defined in this file

```typescript
const cardIdOnWire = z.string().transform((s) => cardId(s));
// ...
export const clientMessageSchema = z.discriminatedUnion('type', [
  // ...
  z.object({
    type: z.literal('SUBMIT_ORDER'),
    round: z.number().int(),
    agentId: z.string(),
    actions: z.array(actionSchema).min(1).max(2),
    buySilencers: z.number().int().min(0).optional(),
  }),
]);
```
Add a new union member using the existing `cardIdOnWire` transform:
```typescript
z.object({
  type: z.literal('SUBMIT_LOADOUT'),
  cards: z.array(cardIdOnWire),
}),
```
Per the file's own header comment (lines 8-16), this is the *only* place a message shape may be defined — no second schema file, no hand-written parallel TS type (the type is derived via `z.infer<typeof clientMessageSchema>`). No `playerId` field, matching the established comment convention already in this file (lines 90-96) explaining why `SET_READY`/`SET_CODENAME`/`SUBMIT_ORDER` carry no identity field.

---

### `apps/party/src/state.ts` (MODIFIED — `RoomSeat.loadout` + reducer)

**Analog:** itself — `RoomSeat` interface (lines 34-44) and the `setReady`/`setCodename` reducer functions (lines 113-130)

```typescript
export interface RoomSeat extends LobbySeat {
  token: string | null;
  connectionId: string | null;
  personality: PersonalityId | null;
  difficulty: Difficulty | null;
}

export function setCodename(state: RoomState, playerId: string, codename: string): RoomState {
  if (state.phase !== 'LOBBY') return state;
  return {
    ...state,
    seats: state.seats.map((seat) =>
      seat.playerId === playerId && !seat.ready ? { ...seat, codename } : seat,
    ),
  };
}
```
Add `loadout: CardId[] | null` to `RoomSeat` (server-only — per RESEARCH.md Pitfall 5, do **not** add it to `LobbySeat`/`toSnapshot()`'s projection at lines 171-186). Add a `setLoadout(state, playerId, cards): RoomState` reducer mirroring `setCodename`'s per-seat-only-update shape (map over `seats`, replace only the matching seat, immutable spread) — and per D-03/D-05, this reducer should be allowed even when the seat is `ready` (unlike `setCodename`'s rename-before-ready rule) since D-05 already clears ready as a *separate* explicit step, not gated inside this reducer. Also update `emptySeats()` (lines 85-98) to initialize `loadout: null`.

---

### `apps/party/src/handlers.ts` (MODIFIED — `handleSubmitLoadout`)

**Analog:** itself — `handleSetReady` (lines 179-190, simplest shape) and `handleSubmitOrder` (lines 229-288, full accept/reject shape with server re-validation)

**Simple no-ack pattern (`handleSetReady`):**
```typescript
export function handleSetReady(
  state: RoomState | null,
  ready: boolean,
  connectionId: string,
  now: number,
): RoomState | null {
  if (!state) return null;
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return state;
  const withReady = setReady(state, seat.playerId, ready);
  return recomputeCountdown(withReady, now, COUNTDOWN_DURATION_MS);
}
```

**Full validate-and-reject pattern (`handleSubmitOrder`), for reference on the "re-validate against engine, never trust client" convention (lines 217-288):**
```typescript
export function handleSubmitOrder(
  state: RoomState | null,
  message: Extract<ClientMessage, { type: 'SUBMIT_ORDER' }>,
  connectionId: string,
): SubmitOrderResult {
  if (!state) return { state: null, toSender: null, acceptedFor: null };
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return { state, toSender: null, acceptedFor: null };
  // ... phase guard, then engine call, then accept/reject branches
}
```
Per RESEARCH.md's Open Question 1 recommendation, `handleSubmitLoadout` can follow the **simpler `handleSetReady` shape** (resolve seat via `seatFor`, write `message.cards` onto `RoomSeat.loadout` via the new `setLoadout` reducer, no ack/reject message needed) — with `startMatch` (`settings.ts`) doing the authoritative `validateLoadout()` re-check and safe-fallback at match-start time, per Pitfall 2/Open Question 1. If a stronger UX signal is wanted later, `handleSubmitOrder`'s reject-with-`ORDER_REJECTED`-equivalent shape is the pattern to copy — resolve seat first, never trust a `playerId` in the message body (rule 2 of `apps/party/src/CLAUDE.md`).

---

### `apps/party/src/settings.ts` (MODIFIED — remove blanket `PHANTOM`)

**Analog:** itself — `startMatch`'s current PHANTOM-overwrite loop (lines 46-75)

```typescript
export function startMatch(state: RoomState, now: number): RoomState {
  if (state.phase !== 'LOBBY' && state.phase !== 'LOADOUT') return state;
  const filled = fillEmptySeatsWithBots(state, seedRng(`${state.matchId}:bots`));
  const config = buildMatchConfig(filled);
  const gameState = createMatch(config, state.matchId);

  // D-01: no deckbuilder this phase — every seat plays PHANTOM regardless
  // of the faction-based starter loadout createMatch() assigns by default.
  const withPhantom = {
    ...gameState,
    players: Object.fromEntries(
      Object.entries(gameState.players).map(([id, player]) => [
        id,
        { ...player, loadout: [...PHANTOM], passivesAvailable: consumablePassivesIn(PHANTOM) },
      ]),
    ),
  };

  return { ...filled, phase: 'IN_GAME', startsAt: null, gameState: withPhantom };
}
```
Replace the blanket overwrite with a per-seat branch (Pitfall 4 in RESEARCH.md): for each player entry, find the matching `filled` seat by `id`/`playerId`. If `seat.kind === 'BOT'`, leave `gameState.players[id].loadout` untouched (createMatch's own `defaultLoadoutFor(seat.faction)` default already applied). If `seat.kind !== 'BOT'`, use `seat.loadout` when present and `validateLoadout(seat.loadout, ruleset).length === 0`; otherwise fall back to `[...PHANTOM]` as a safe default (Pitfall 2/Open Question 1's recommended defense-in-depth). Recompute `passivesAvailable: consumablePassivesIn(loadout)` per the chosen loadout, exactly as the existing code already does for `PHANTOM`.

---

### `apps/party/tests/botfill.test.ts` (MODIFIED — regression fix)

**Analog:** itself — the existing assertion at lines 117-122 ("after startMatch, phase is IN_GAME, gameState is non-null, and every loadout is PHANTOM")

Rewrite to assert bot seats keep their per-faction/`PHANTOM`-fallback default while a human seat with a submitted legal loadout gets that exact loadout — this is a required edit, not new test surface, per RESEARCH.md's Wave 0 Gaps.

## Shared Patterns

### SSR-safe localStorage hydration
**Source:** `apps/web/lib/identity.ts` lines 67-141, callsite pattern at `apps/web/app/lobby/[code]/page.tsx:20`
**Apply to:** `loadoutStore.ts`, `app/deck/page.tsx`
```typescript
function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}
const [identity] = useState(() => loadIdentity());
```
Never call the storage-reading function at Zustand `create()` module-eval time — read it inside a lazy initializer or a mount-time effect only.

### Never reimplement engine validation client-side
**Source:** `packages/engine/src/loadout.ts` (`validateLoadout`, `budgetPointsOf`, `consumablePassivesIn`), already used by `apps/party/src/handlers.ts`'s `submitOrder`-style pattern of calling the engine, not reimplementing rules, in the room
**Apply to:** `loadoutStore.ts` / `LegalityMeter.tsx` (client preview) and `apps/party/src/settings.ts` / a `handleSubmitLoadout` server-side re-check — both call sites must import the same `validateLoadout` export from `@berlin/engine` against the same `DEFAULT_RULESET`, never a parallel calculation.

### Never trust a `playerId` in a message body — resolve the acting seat from the connection
**Source:** `apps/party/src/handlers.ts` — every handler (`handleSetReady`, `handleSetCodename`, `handleSubmitOrder`) starts with `const seat = seatFor(state, connectionId); if (!seat || !seat.playerId) return ...;`
**Apply to:** the new `handleSubmitLoadout` — the `SUBMIT_LOADOUT` wire message must carry no `playerId`/seat-identifying field (matches `packages/shared/src/protocol.ts`'s existing convention documented in its own comments at lines 90-96).

### Immutable per-seat reducer over `RoomState.seats`
**Source:** `apps/party/src/state.ts` `setReady`/`setCodename` — `state.seats.map((seat) => (seat.playerId === playerId ? { ...seat, field } : seat))`
**Apply to:** the new `setLoadout` reducer in `state.ts`.

### One network chokepoint, Zod-parse before send
**Source:** `apps/web/lib/socket.ts` — every outbound call runs `clientMessageSchema.parse(message)` immediately before `socket.send()`; every inbound frame runs `serverMessageSchema.safeParse(...)` and drops on failure.
**Apply to:** the new `submitLoadout()` export in `socket.ts` — no other file in `apps/web` may construct a `PartySocket` or call `.send()` directly (per `apps/web/lib/CLAUDE.md` rule 1).

### Components take props/callbacks only, no I/O
**Source:** `apps/web/components/orders/OrderComposer.tsx` — takes `view`, `draft`, `orderStatus` as props and `onAssign`/`onSubmit` as callbacks; touches no store, no socket.
**Apply to:** `Deckbuilder.tsx`, `CardGrid.tsx`, `LegalityMeter.tsx`, `PresetPicker.tsx` — all four take data + callbacks; `loadoutStore` reads/writes and `socket.ts` calls live only in `app/deck/page.tsx` and `app/lobby/[code]/page.tsx`.

## No Analog Found

None — every file in this phase's scope has a direct or composite analog already in the codebase (see composite entries above, e.g. `loadoutStore.ts` combining `identity.ts` + `uiStore.ts` patterns).

## Metadata

**Analog search scope:** `apps/web/lib/`, `apps/web/components/orders/`, `apps/web/components/lobby/`, `apps/web/app/lobby/[code]/`, `apps/party/src/`, `packages/shared/src/`, `packages/engine/src/loadout.ts`, `packages/engine/src/content/`
**Files scanned:** `identity.ts`, `matchStore.ts`, `uiStore.ts`, `socket.ts`, `OrderComposer.tsx`, `lobby/[code]/page.tsx`, `handlers.ts`, `state.ts`, `settings.ts`, `protocol.ts`, plus supporting `CLAUDE.md` conventions in `apps/web/`, `apps/web/lib/`, `apps/web/app/`, `apps/web/components/`, `apps/party/`, `apps/party/src/`
**Pattern extraction date:** 2026-08-27
