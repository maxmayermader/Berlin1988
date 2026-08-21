import type { ClientMessage, ServerErrorCode } from '@berlin/shared';

/**
 * HOME-01/HOME-02's client logic as a pure reducer — no React, no DOM, no
 * network. Every state change is driven by an explicit server frame or an
 * explicit socket close, never by an optimistic local flag set at click time
 * (01-RESEARCH.md Pitfall 2/2b). components/home/CreateJoinPanel.tsx holds
 * this state and forwards whatever `dispatch` comes back through lib/socket.ts.
 */

export type CreateJoinStatus = 'idle' | 'pending' | 'error' | 'joined';

export interface CreateJoinState {
  readonly status: CreateJoinStatus;
  readonly error: string | null;
  readonly code: string | null;
}

export type CreateJoinEvent =
  | { readonly type: 'CLICK_CREATE'; readonly codename: string }
  | { readonly type: 'CLICK_JOIN'; readonly raw: string; readonly codename: string }
  | { readonly type: 'JOINED'; readonly code: string }
  | { readonly type: 'SERVER_ERROR'; readonly code: ServerErrorCode; readonly message: string }
  | { readonly type: 'SOCKET_CLOSED' };

export interface ReduceResult {
  readonly state: CreateJoinState;
  readonly dispatch: ClientMessage | null;
}

/** apps/web/app/lobby/[code]/page.tsx's "Connecting…" copy takes over once
 *  navigation happens; JOIN_CODE_INPUT_LENGTH is this app's own UX pre-filter
 *  and deliberately not imported from apps/party — an app importing another
 *  app is a dependency-direction violation, and the room's UNKNOWN_CODE
 *  reply stays the sole authority on whether a code names a real lobby. */
export const JOIN_CODE_INPUT_LENGTH = 6;

/** 01-UI-SPEC.md's exact copy for an unknown/invalid join code. Quoted here
 *  and nowhere else in this file. */
export const UNKNOWN_CODE_MESSAGE =
  "That code doesn't match an open lobby. Double-check it and try again.";

const SOCKET_CLOSED_MESSAGE = 'Connection lost. Refresh to try rejoining.';

export function idleState(): CreateJoinState {
  return { status: 'idle', error: null, code: null };
}

export function isPending(state: CreateJoinState): boolean {
  return state.status === 'pending';
}

export function lobbyPath(code: string): string {
  return `/lobby/${code}`;
}

export function normalizeJoinCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '').slice(0, JOIN_CODE_INPUT_LENGTH);
}

const JOIN_CODE_SHAPE = /^[A-Z0-9]{6}$/;

export function isWellFormedJoinCode(code: string): boolean {
  return JOIN_CODE_SHAPE.test(code);
}

function unchanged(state: CreateJoinState): ReduceResult {
  return { state, dispatch: null };
}

/**
 * Total: an event that is meaningless in the current status returns the
 * state unchanged with a null dispatch rather than throwing. Returning the
 * next state *and* the outbound frame together is the point — whether a
 * click sends anything becomes an assertable value.
 */
export function reduce(state: CreateJoinState, event: CreateJoinEvent): ReduceResult {
  switch (event.type) {
    case 'CLICK_CREATE': {
      if (isPending(state)) return unchanged(state);
      return {
        state: { status: 'pending', error: null, code: null },
        dispatch: { type: 'CREATE', codename: event.codename },
      };
    }

    case 'CLICK_JOIN': {
      if (isPending(state)) return unchanged(state);
      const code = normalizeJoinCode(event.raw);
      if (!isWellFormedJoinCode(code)) {
        return { state: { status: 'error', error: UNKNOWN_CODE_MESSAGE, code: null }, dispatch: null };
      }
      return {
        state: { status: 'pending', error: null, code: null },
        dispatch: { type: 'JOIN', code, codename: event.codename },
      };
    }

    case 'JOINED': {
      if (!isPending(state)) return unchanged(state);
      return { state: { status: 'joined', error: null, code: event.code }, dispatch: null };
    }

    case 'SERVER_ERROR': {
      if (!isPending(state)) return unchanged(state);
      const message = event.code === 'UNKNOWN_CODE' ? UNKNOWN_CODE_MESSAGE : event.message;
      return { state: { status: 'error', error: message, code: null }, dispatch: null };
    }

    case 'SOCKET_CLOSED': {
      if (!isPending(state)) return unchanged(state);
      return { state: { status: 'error', error: SOCKET_CLOSED_MESSAGE, code: null }, dispatch: null };
    }

    default:
      return unchanged(state);
  }
}
