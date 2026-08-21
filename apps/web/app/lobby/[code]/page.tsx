'use client';

import type { LobbySnapshot } from '@berlin/shared';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { loadIdentity } from '../../../lib/identity.js';
import { useRoomSocket } from '../../../lib/socket.js';

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [identity] = useState(() => loadIdentity());

  useRoomSocket(code, identity.codename, (message) => {
    if (message.type === 'ROOM_STATE') setSnapshot(message.snapshot);
  });

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <h2 className="text-[20px] font-semibold leading-[1.2]">Seats</h2>

      {!snapshot ? (
        <p className="text-sm">Connecting…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {snapshot.seats.map((seat) => (
            <li
              key={seat.index}
              className="rounded border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-2 text-base"
            >
              {seat.kind === 'OPEN' ? (
                <>
                  <span className="font-semibold">Open Seat</span>
                  <span className="block text-sm">
                    An AI opponent will join when the match starts.
                  </span>
                </>
              ) : (
                <span className="truncate">{seat.codename}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
