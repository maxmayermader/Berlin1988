import { DIRECTORY_PARTY_NAME, DIRECTORY_ROOM_ID, directoryCommandSchema } from '@berlin/shared';
import type { DirectoryCommand } from '@berlin/shared';
import type * as Party from 'partykit/server';
import type { RoomState } from './state.js';

/**
 * Pushes this room's public lobby metadata into the directory party, or
 * removes it, derived purely from `state.phase` (never called with a null
 * state — apps/party/src/room.ts's pushDirectory wrapper no-ops on null
 * first). LOBBY/LOADOUT produce an UPSERT; IN_GAME/ENDED produce a REMOVE.
 *
 * The entire cross-party access — from reading `room.context` through
 * awaiting the fetch — is wrapped in a single try/catch that swallows any
 * throw and returns. PartyKit documents `room.context.parties` as
 * unavailable inside onAlarm (03-RESEARCH.md Pitfall 5), and a directory
 * write failing must never abort or corrupt the match room's own state
 * transition. A write that silently fails here self-heals the next time
 * this function runs from a message-context call site — Task 2 wires the
 * SUBMIT_ORDER call site specifically as that self-heal path, since it is
 * the first inbound message a match reliably receives after startMatch.
 */
export async function syncDirectory(room: Party.Room, state: RoomState): Promise<void> {
  try {
    const command = directoryCommandSchema.parse(commandFor(state));
    const body = JSON.stringify(command);
    await room.context.parties[DIRECTORY_PARTY_NAME]
      ?.get(DIRECTORY_ROOM_ID)
      .fetch({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  } catch {
    // Swallowed deliberately — see doc comment above.
  }
}

function commandFor(state: RoomState): DirectoryCommand {
  if (state.phase === 'LOBBY' || state.phase === 'LOADOUT') {
    const hostSeat = state.seats.find((seat) => seat.playerId === state.hostPlayerId);
    return {
      type: 'UPSERT',
      entry: {
        code: state.code,
        seatsFilled: state.seats.filter((seat) => seat.kind !== 'OPEN').length,
        seatsTotal: state.seats.length,
        hostCodename: hostSeat?.codename ?? 'Host',
      },
    };
  }
  return { type: 'REMOVE', code: state.code };
}
