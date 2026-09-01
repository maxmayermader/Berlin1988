'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  idleState,
  isPending,
  lobbyPath,
  reduce,
  type CreateJoinState,
} from '../../lib/createJoin.js';
import { useDirectorySocket } from '../../lib/directorySocket.js';
import { loadIdentity } from '../../lib/identity.js';
import { CONNECTING_LABEL, EMPTY_BODY, EMPTY_HEADING, lobbyRows } from '../../lib/lobbyList.js';
import { handshake, storeRoomToken } from '../../lib/socket.js';
import { Button } from '../ui/Button.js';

/**
 * The public lobby browser (HOME-03) — one row per entry the directory
 * party currently holds. The Join click handler performs the identical
 * reduce()/handshake()/storeRoomToken()/lobbyPath() sequence
 * CreateJoinPanel.settle() already performs for a typed code — this
 * component never builds a second join reducer, error-copy constant, or
 * token-storage path.
 */
export function OpenLobbies() {
  const router = useRouter();
  const feed = useDirectorySocket();
  const [state, setState] = useState<CreateJoinState>(idleState());

  async function onJoin(code: string) {
    const identity = loadIdentity();
    const { state: next, dispatch } = reduce(state, {
      type: 'CLICK_JOIN',
      raw: code,
      codename: identity.codename,
    });
    setState(next);
    if (!dispatch || dispatch.type !== 'JOIN') return; // already pending

    const outcome = await handshake(code, dispatch);
    if (outcome.ok) {
      storeRoomToken(code, outcome.message.token);
      setState(reduce(next, { type: 'JOINED', code: outcome.message.code }).state);
      router.push(lobbyPath(outcome.message.code));
      return;
    }
    if (outcome.message) {
      setState(
        reduce(next, {
          type: 'SERVER_ERROR',
          code: outcome.message.code,
          message: outcome.message.message,
        }).state,
      );
    } else {
      setState(reduce(next, { type: 'SOCKET_CLOSED' }).state);
    }
  }

  const pending = isPending(state);
  const rows = lobbyRows(feed.lobbies);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold leading-[1.2]">Open Lobbies</h2>
      {!feed.everConnected ? (
        // Before the first accepted DIRECTORY_STATE frame — neither the
        // empty state nor a row list, a neutral in-between (03-UI-SPEC.md
        // UI Considerations "loading" row).
        <p className="text-base text-[#64748b]">{CONNECTING_LABEL}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold leading-[1.2]">{EMPTY_HEADING}</h3>
          <p className="text-base">{EMPTY_BODY}</p>
        </div>
      ) : (
        // A closed socket with rows already in hand keeps rendering those
        // rows for free: `feed.lobbies` is only ever replaced by a fresh
        // DIRECTORY_STATE frame (directorySocket.ts never clears it on
        // close), so there is deliberately no fourth, disconnected branch
        // here.
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-2 rounded border border-[#e2e8f0] bg-[#f1f5f9] p-4"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base">{row.hostLabel}</span>
                <span className="text-sm text-[#64748b]">{row.seatsLabel}</span>
              </span>
              <Button pending={pending} onClick={() => onJoin(row.code)}>
                Join
              </Button>
            </li>
          ))}
        </ul>
      )}
      {state.status === 'error' && state.error && (
        <p className="text-base text-[#0f172a]">{state.error}</p>
      )}
    </section>
  );
}
