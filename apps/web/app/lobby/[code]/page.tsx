'use client';

import { clientMessageSchema } from '@berlin/shared';
import type { ClientMessage, LobbySnapshot, ServerMessage } from '@berlin/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CodenameEditor } from '../../../components/lobby/CodenameEditor.js';
import { ReadyCountdown } from '../../../components/lobby/ReadyCountdown.js';
import { SeatList } from '../../../components/lobby/SeatList.js';
import { Button } from '../../../components/ui/Button.js';
import { loadIdentity } from '../../../lib/identity.js';
import { useRoomSocket } from '../../../lib/socket.js';

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [identity] = useState(() => loadIdentity());

  const socket = useRoomSocket(code, identity.codename, (message: ServerMessage) => {
    if (message.type === 'ROOM_STATE') setSnapshot(message.snapshot);
    if (message.type === 'JOINED') setPlayerId(message.playerId);
  });

  // The room's own snapshot is the sole trigger — never a locally guessed
  // "the countdown display hit zero", which could fire before the room
  // actually has a GameState and land the player on an empty board.
  useEffect(() => {
    if (snapshot?.phase === 'IN_GAME') {
      router.push(`/match/${code}`);
    }
  }, [snapshot?.phase, code, router]);

  const mySeat = snapshot?.seats.find((seat) => seat.playerId === playerId) ?? null;

  function send(message: ClientMessage) {
    socket.send(JSON.stringify(clientMessageSchema.parse(message)));
  }

  function toggleReady() {
    if (!mySeat) return;
    send({ type: 'SET_READY', ready: !mySeat.ready });
  }

  function renameCodename(codename: string) {
    send({ type: 'SET_CODENAME', codename });
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <h2 className="text-[20px] font-semibold leading-[1.2]">Seats</h2>

      {!snapshot ? (
        <p className="text-sm">Connecting…</p>
      ) : (
        <>
          {mySeat && (
            <CodenameEditor
              value={mySeat.codename ?? ''}
              ready={mySeat.ready}
              onSubmit={renameCodename}
            />
          )}
          <SeatList snapshot={snapshot} onToggleReady={toggleReady} myPlayerId={playerId} />
          {mySeat && <Button onClick={toggleReady}>{mySeat.ready ? 'Ready ✓' : 'Ready Up'}</Button>}
          <ReadyCountdown snapshot={snapshot} />
        </>
      )}
    </main>
  );
}
