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
    <div className="flex flex-col gap-8">
      <Button pending={pending} onClick={onCreate}>
        Create Game
      </Button>

      <div className="flex gap-2">
        <input
          value={joinInput}
          onChange={(event) => setJoinInput(event.target.value)}
          placeholder="Enter join code"
          className="flex-1 rounded border border-[#e2e8f0] px-3 py-2 text-base focus:border-[#2563eb] focus:outline-none"
        />
        <Button pending={pending} onClick={onJoin}>
          Join Game
        </Button>
      </div>

      {state.status === 'error' && state.error && (
        <p className={showUnknownCodeTone ? 'text-base' : 'text-base text-[#0f172a]'}>{state.error}</p>
      )}
    </div>
  );
}
