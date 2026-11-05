'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loadIdentity } from '../../lib/identity.js';
import {
  UNKNOWN_CODE_MESSAGE,
  idleState,
  isPending,
  lobbyPath,
  reduce,
  type CreateJoinState,
} from '../../lib/createJoin.js';
import { handshake, mintJoinCode, storeRoomToken } from '../../lib/socket.js';
import { Button } from '../ui/Button.js';

/**
 * Owns both home actions (HOME-01, HOME-02). A thin render over
 * lib/createJoin.ts — it holds the reducer's state, forwards clicks and
 * server frames into reduce(), and sends whatever dispatch comes back
 * through lib/socket.ts. It decides nothing itself.
 */
export function CreateJoinPanel() {
  const router = useRouter();
  const [state, setState] = useState<CreateJoinState>(idleState());
  const [joinInput, setJoinInput] = useState('');

  async function settle(
    afterClick: CreateJoinState,
    room: string,
    message: Parameters<typeof handshake>[1],
  ) {
    const outcome = await handshake(room, message);
    if (outcome.ok) {
      storeRoomToken(room, outcome.message.token);
      setState(reduce(afterClick, { type: 'JOINED', code: outcome.message.code }).state);
      router.push(lobbyPath(outcome.message.code));
      return;
    }
    if (outcome.message) {
      setState(
        reduce(afterClick, {
          type: 'SERVER_ERROR',
          code: outcome.message.code,
          message: outcome.message.message,
        }).state,
      );
    } else {
      setState(reduce(afterClick, { type: 'SOCKET_CLOSED' }).state);
    }
  }

  async function onCreate() {
    const identity = loadIdentity();
    const { state: next, dispatch } = reduce(state, {
      type: 'CLICK_CREATE',
      codename: identity.codename,
    });
    setState(next);
    if (!dispatch) return; // already pending — the button disables until the server responds

    try {
      const code = await mintJoinCode();
      await settle(next, code, dispatch);
    } catch {
      // Network/mint failure before a room ever existed — no lobby was left
      // half-created, and the UI returns to an explicit, retryable error
      // state rather than hanging in "pending" forever.
      setState(reduce(next, { type: 'SOCKET_CLOSED' }).state);
    }
  }

  async function onJoin() {
    const identity = loadIdentity();
    const { state: next, dispatch } = reduce(state, {
      type: 'CLICK_JOIN',
      raw: joinInput,
      codename: identity.codename,
    });
    setState(next);
    if (!dispatch || dispatch.type !== 'JOIN') return; // malformed code, or already pending

    try {
      await settle(next, dispatch.code, dispatch);
    } catch {
      setState(reduce(next, { type: 'SOCKET_CLOSED' }).state);
    }
  }

  const pending = isPending(state);
  const showUnknownCodeTone = state.status === 'error' && state.error === UNKNOWN_CODE_MESSAGE;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button pending={pending} onClick={onCreate} size="lg" block>
          Create Game
        </Button>
        <p className="text-sm text-ink-muted">Opens a lobby with a join code. Any seat left empty gets an AI.</p>
      </div>

      <div className="flex items-center gap-3 text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 border-t border-dashed border-rule-strong" />
        <span className="label-caps">or</span>
        <span className="h-px flex-1 border-t border-dashed border-rule-strong" />
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="join-code">
          Join code
        </label>
        <input
          id="join-code"
          value={joinInput}
          onChange={(event) => setJoinInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void onJoin();
          }}
          placeholder="Enter join code"
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 min-w-0 flex-1 rounded-[2px] border-2 border-rule-strong bg-paper px-3 py-2 font-bold uppercase tracking-[0.3em] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-muted focus:border-accent"
        />
        <Button variant="ghost" pending={pending} onClick={onJoin}>
          Join Game
        </Button>
      </div>

      {state.status === 'error' && state.error && (
        <p className={`border-l-4 px-3 py-1.5 text-sm ${showUnknownCodeTone ? 'border-stamp text-stamp' : 'border-ink text-ink'}`}>
          {state.error}
        </p>
      )}
    </div>
  );
}
