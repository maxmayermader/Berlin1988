import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_CODE_MESSAGE,
  idleState,
  isWellFormedJoinCode,
  lobbyPath,
  normalizeJoinCode,
  reduce,
} from './createJoin.js';

describe('createJoin reducer', () => {
  it('CLICK_CREATE transitions idle to pending and dispatches exactly one CREATE frame', () => {
    const { state, dispatch } = reduce(idleState(), { type: 'CLICK_CREATE', codename: 'Vogel' });
    expect(state.status).toBe('pending');
    expect(dispatch).toEqual({ type: 'CREATE', codename: 'Vogel' });
  });

  it('a second CLICK_CREATE while already pending dispatches nothing and leaves state unchanged', () => {
    const first = reduce(idleState(), { type: 'CLICK_CREATE', codename: 'Vogel' });
    const second = reduce(first.state, { type: 'CLICK_CREATE', codename: 'Vogel' });
    expect(second.dispatch).toBeNull();
    expect(second.state).toEqual(first.state);
  });

  it('a JOINED event on a pending state transitions to joined, carrying the code', () => {
    const pending = reduce(idleState(), { type: 'CLICK_CREATE', codename: 'Vogel' }).state;
    const { state } = reduce(pending, { type: 'JOINED', code: 'ABCDEF' });
    expect(state.status).toBe('joined');
    expect(state.code).toBe('ABCDEF');
    expect(lobbyPath(state.code!)).toBe('/lobby/ABCDEF');
  });

  it('a SERVER_ERROR on a pending state returns to error, clearing pending; SOCKET_CLOSED does the same', () => {
    const pending = reduce(idleState(), { type: 'CLICK_CREATE', codename: 'Vogel' }).state;

    const errored = reduce(pending, { type: 'SERVER_ERROR', code: 'BAD_MESSAGE', message: 'nope' });
    expect(errored.state.status).toBe('error');
    expect(errored.state.error).toBe('nope');

    const closed = reduce(pending, { type: 'SOCKET_CLOSED' });
    expect(closed.state.status).toBe('error');
    expect(closed.state.error).toBeTruthy();
  });

  it('a fresh CLICK_CREATE from an error state is recoverable, not terminal', () => {
    const pending = reduce(idleState(), { type: 'CLICK_CREATE', codename: 'Vogel' }).state;
    const errored = reduce(pending, { type: 'SERVER_ERROR', code: 'ROOM_FULL', message: 'full' }).state;
    const retried = reduce(errored, { type: 'CLICK_CREATE', codename: 'Vogel' });
    expect(retried.state.status).toBe('pending');
    expect(retried.dispatch).toEqual({ type: 'CREATE', codename: 'Vogel' });
  });

  it('an UNKNOWN_CODE server error carries the exact UI-SPEC copy', () => {
    const pending = reduce(idleState(), { type: 'CLICK_JOIN', raw: 'abcdef', codename: 'Vogel' }).state;
    const { state } = reduce(pending, {
      type: 'SERVER_ERROR',
      code: 'UNKNOWN_CODE',
      message: 'server-side detail, ignored',
    });
    expect(state.error).toBe(UNKNOWN_CODE_MESSAGE);
  });

  it('no event other than JOINED ever produces status joined', () => {
    let state = idleState();
    state = reduce(state, { type: 'CLICK_CREATE', codename: 'Vogel' }).state;
    state = reduce(state, { type: 'SERVER_ERROR', code: 'BAD_MESSAGE', message: 'x' }).state;
    expect(state.status).not.toBe('joined');
    state = reduce(state, { type: 'SOCKET_CLOSED' }).state;
    expect(state.status).not.toBe('joined');
  });

  it('normalizeJoinCode upper-cases, strips whitespace, and caps at JOIN_CODE_INPUT_LENGTH', () => {
    expect(normalizeJoinCode(' ab cd ef gh ')).toBe('ABCDEF');
    expect(normalizeJoinCode('xy')).toBe('XY');
  });

  it('isWellFormedJoinCode rejects the wrong length and non-alphanumeric characters, and CLICK_JOIN with such a code never dispatches', () => {
    expect(isWellFormedJoinCode('ABC')).toBe(false);
    expect(isWellFormedJoinCode('ABC-EF')).toBe(false);
    expect(isWellFormedJoinCode('ABCDEF')).toBe(true);

    const { state, dispatch } = reduce(idleState(), {
      type: 'CLICK_JOIN',
      raw: 'a b',
      codename: 'Vogel',
    });
    expect(state.status).toBe('error');
    expect(dispatch).toBeNull();
  });

  it('a well-formed CLICK_JOIN dispatches exactly one JOIN frame with the normalized code', () => {
    const { state, dispatch } = reduce(idleState(), {
      type: 'CLICK_JOIN',
      raw: 'abcdef',
      codename: 'Katja',
    });
    expect(state.status).toBe('pending');
    expect(dispatch).toEqual({ type: 'JOIN', code: 'ABCDEF', codename: 'Katja' });
  });
});
