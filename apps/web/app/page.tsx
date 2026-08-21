'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { handshake, mintJoinCode, storeRoomToken } from '../lib/socket.js';

/**
 * Home — Task 1's minimal create/join wiring, proving the round trip end to
 * end. Plan 01-01 Task 3 replaces this with components/home/CreateJoinPanel,
 * backed by the pure lib/createJoin.ts reducer and real player identity.
 */
export default function HomePage() {
  const router = useRouter();
  const [codename] = useState('Agent');
  const [joinCode, setJoinCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setPending(true);
    setError(null);
    try {
      const code = await mintJoinCode();
      const outcome = await handshake(code, { type: 'CREATE', codename });
      if (outcome.ok) {
        storeRoomToken(code, outcome.message.token);
        router.push(`/lobby/${code}`);
        return;
      }
      setError(outcome.message?.message ?? 'Could not create a lobby.');
    } finally {
      setPending(false);
    }
  }

  async function onJoin() {
    const code = joinCode.trim().toUpperCase();
    setPending(true);
    setError(null);
    try {
      const outcome = await handshake(code, { type: 'JOIN', code, codename });
      if (outcome.ok) {
        storeRoomToken(code, outcome.message.token);
        router.push(`/lobby/${code}`);
        return;
      }
      setError(outcome.message?.message ?? "That code doesn't match an open lobby. Double-check it and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-16">
      <h1 className="text-[28px] font-semibold leading-[1.2]">Berlin 1988</h1>

      <button
        type="button"
        disabled={pending}
        onClick={onCreate}
        className="rounded bg-[#2563eb] px-4 py-2 text-base font-semibold text-white disabled:opacity-50"
      >
        Create Game
      </button>

      <div className="flex gap-2">
        <input
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value)}
          placeholder="Enter join code"
          className="flex-1 rounded border border-[#e2e8f0] px-3 py-2"
        />
        <button
          type="button"
          disabled={pending}
          onClick={onJoin}
          className="rounded bg-[#2563eb] px-4 py-2 text-base font-semibold text-white disabled:opacity-50"
        >
          Join Game
        </button>
      </div>

      {error && <p className="text-base">{error}</p>}
    </main>
  );
}
