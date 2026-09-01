import { directoryCommandSchema, serverMessageSchema } from '@berlin/shared';
import type { DirectoryEntry, ServerMessage } from '@berlin/shared';
import type * as Party from 'partykit/server';

const STATE_KEY = 'entries';

/**
 * The public lobby-directory party (Phase 3, HOME-03) — a singleton
 * registry every match room's syncDirectory() call writes into, and every
 * home-page browser subscribes to over its own read-only WebSocket.
 *
 * This class is this project's one untrusted-input boundary for cross-party
 * writes (03-RESEARCH.md Security Domain, threat T-03-02): the caller being
 * this project's own match-room code does not make its payload trusted, so
 * every mutation still goes through directoryCommandSchema.safeParse before
 * touching state, exactly as if it arrived from the open internet.
 *
 * Holds entries in a Map<code, DirectoryEntry> so an UPSERT of an
 * already-registered code updates the entry in place rather than moving it
 * to the end of iteration order — Map.set() on an existing key never
 * reorders it, and DIRECTORY_STATE's `lobbies` array is built directly from
 * that iteration order, so this is what keeps the public list's row order
 * stable across a seat-count change (03-01-PLAN.md's insertion-order truth).
 */
export default class LobbyDirectory implements Party.Server {
  private entries = new Map<string, DirectoryEntry>();

  constructor(readonly room: Party.Room) {}

  async onStart(): Promise<void> {
    const stored = await this.room.storage.get<[string, DirectoryEntry][]>(STATE_KEY);
    if (stored) this.entries = new Map(stored);
  }

  /**
   * Sends the current DIRECTORY_STATE to the newly-connected client only —
   * the one place this class uses onConnect. Safe here (unlike the
   * hibernation hazard apps/party/src/room.ts warns about for MatchRoom)
   * because it sends a single snapshot and attaches no per-connection
   * handlers of its own; every subsequent update reaches this connection
   * through the ordinary onRequest -> broadcast path below.
   */
  onConnect(connection: Party.Connection): void {
    connection.send(JSON.stringify(this.stateMessage()));
  }

  /**
   * The directory's one untrusted-input boundary. Method-gated to POST;
   * body JSON.parse wrapped in try/catch; directoryCommandSchema.safeParse
   * gates every mutation. No path stores an unvalidated value — every
   * hostile-input case this phase closes is closed by the schema
   * (z.strictObject, hostCodename's 20-char cap, seatsTotal's 1..4 range)
   * rather than by hand-rolled checks (T-03-02).
   */
  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let text: string;
    try {
      text = await req.text();
    } catch {
      return new Response('Malformed body', { status: 400 });
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return new Response('Malformed body', { status: 400 });
    }

    const parsed = directoryCommandSchema.safeParse(json);
    if (!parsed.success) {
      return new Response('Malformed command', { status: 400 });
    }

    const command = parsed.data;
    if (command.type === 'UPSERT') {
      this.entries.set(command.entry.code, command.entry);
    } else {
      this.entries.delete(command.code);
    }

    await this.persist();
    this.broadcast();
    return new Response(null, { status: 204 });
  }

  private async persist(): Promise<void> {
    await this.room.storage.put(STATE_KEY, [...this.entries.entries()]);
  }

  private stateMessage(): ServerMessage {
    const message: ServerMessage = { type: 'DIRECTORY_STATE', lobbies: [...this.entries.values()] };
    return serverMessageSchema.parse(message);
  }

  private broadcast(): void {
    const payload = JSON.stringify(this.stateMessage());
    for (const connection of this.room.getConnections()) {
      connection.send(payload);
    }
  }
}
