import { clientMessageSchema, serverMessageSchema } from '@berlin/shared';
import type { ClientMessage, ServerMessage } from '@berlin/shared';

/**
 * A one-time measurement, not a standing test — deliberately outside
 * apps/party/tests/ and unmatched by vitest.config.ts's `include` patterns,
 * so it never runs in CI and never becomes a flaky wall-clock gate.
 *
 * Closes two of ROADMAP.md's Research Flags:
 *  - concurrent 4-player timing under real network conditions (never
 *    measured — the engine is proven at p99 <50ms per bot decision in
 *    packages/ai/tests/validation.test.ts, but nothing in this repo has
 *    ever had four real connections queuing messages at one live room)
 *  - the observed per-round ResolutionEvent count at n=4, the second half
 *    of the resolution-step-timing flag Plan 01-05 only proved the *order*
 *    of, not the *count* for
 *
 * Run against a locally running `partykit dev` room (no Cloudflare account
 * needed — that's only for `partykit deploy`):
 *
 *   pnpm dev             # terminal 1 — full local stack
 *   pnpm measure:timing  # terminal 2 — this script
 *
 * All four seats are real WebSocket connections (not server-side AI bots) —
 * that's the point: the measurement is of concurrent *connections* queuing
 * at the room, not of decision quality, which packages/ai already proves
 * elsewhere. Every seat just Holds every round, which is sufficient to
 * reach ROUND_LIMIT deterministically after `--rounds` rounds without
 * anyone being eliminated along the way.
 */

interface Args {
  rounds: number;
  host: string;
}

function parseArgs(argv: readonly string[]): Args {
  let rounds = 14;
  let host = '127.0.0.1:1999';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rounds' && argv[i + 1]) rounds = Number(argv[++i]);
    else if (argv[i] === '--host' && argv[i + 1]) host = argv[++i] as string;
  }
  if (!Number.isFinite(rounds) || rounds < 1) {
    throw new Error(`--rounds must be a positive integer, got ${String(rounds)}`);
  }
  return { rounds, host };
}

async function mintCode(host: string): Promise<string> {
  const res = await fetch(`http://${host}/parties/match/_new`, { method: 'POST' });
  if (!res.ok) throw new Error(`Mint endpoint returned ${res.status}`);
  const body = (await res.json()) as { code?: unknown };
  if (typeof body.code !== 'string') throw new Error('Mint endpoint did not return a code.');
  return body.code;
}

interface AgentInfo {
  readonly id: string;
}

/** One of the four real connections this script drives. */
class Runner {
  socket: WebSocket;
  playerId: string | null = null;
  /** Every living agent id from the runner's own last VIEW/ROUND_RESOLVED. */
  agents: AgentInfo[] = [];
  outcome: unknown = null;
  /** round -> ORDER_ACK receipt time, for round-trip latency. */
  readonly ackAt = new Map<number, number>();
  /** round -> ROUND_RESOLVED receipt time. */
  readonly resolvedAt = new Map<number, number>();
  /** round -> event count from that round's lastRound. */
  readonly eventCount = new Map<number, number>();
  private opened: Promise<void>;
  private resolveOpened!: () => void;

  constructor(
    readonly codename: string,
    host: string,
    code: string,
    private readonly onInFlightChange: (delta: number) => void,
  ) {
    this.opened = new Promise((resolve) => {
      this.resolveOpened = resolve;
    });
    this.socket = new WebSocket(`ws://${host}/parties/match/${code}`);
    this.socket.addEventListener('open', () => this.resolveOpened());
    this.socket.addEventListener('message', (event) => this.onMessage(event));
  }

  async waitOpen(): Promise<void> {
    await this.opened;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(clientMessageSchema.parse(message)));
  }

  private onMessage(event: MessageEvent): void {
    let parsed: ReturnType<typeof serverMessageSchema.safeParse>;
    try {
      parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const message: ServerMessage = parsed.data;
    const now = performance.now();

    if (message.type === 'JOINED') {
      this.playerId = message.playerId;
    } else if (message.type === 'VIEW') {
      this.agents = message.view.self.agents.filter((a) => a.alive).map((a) => ({ id: a.id as string }));
      this.outcome = message.view.outcome;
    } else if (message.type === 'ORDER_ACK') {
      this.ackAt.set(message.round, now);
      this.onInFlightChange(-1);
    } else if (message.type === 'ORDER_REJECTED') {
      this.onInFlightChange(-1);
    } else if (message.type === 'ROUND_RESOLVED') {
      this.resolvedAt.set(message.view.round - 1, now);
      this.eventCount.set(message.view.round - 1, message.view.lastRound.length);
      this.agents = message.view.self.agents.filter((a) => a.alive).map((a) => ({ id: a.id as string }));
      this.outcome = message.view.outcome;
    }
  }

  close(): void {
    this.socket.close();
  }
}

interface RoundRow {
  round: number;
  submitWindowMs: number;
  resolveBroadcastMs: number;
  peakInFlight: number;
  perConnLatencyMs: number[];
  eventCount: number;
  heldTimer: boolean;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
}

function summaryRow(label: string, values: readonly number[]): string {
  if (values.length === 0) return `| ${label} | — | — | — |`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `| ${label} | ${min.toFixed(1)} | ${median(values).toFixed(1)} | ${max.toFixed(1)} |`;
}

async function main(): Promise<void> {
  const { rounds, host } = parseArgs(process.argv.slice(2));
  const roundTimerSeconds = 90; // apps/party/src/settings.ts buildMatchConfig, D-04

  const code = await mintCode(host);
  console.error(`[measure-4p-timing] room ${code} on ${host}, ${rounds} rounds`);

  let inFlight = 0;
  let peakInFlightThisRound = 0;
  const trackInFlight = (delta: number) => {
    inFlight += delta;
    if (inFlight > peakInFlightThisRound) peakInFlightThisRound = inFlight;
  };

  const codenames = ['Runner One', 'Runner Two', 'Runner Three', 'Runner Four'];
  const runners = codenames.map((name) => new Runner(name, host, code, trackInFlight));
  await Promise.all(runners.map((r) => r.waitOpen()));

  const host0 = runners[0] as Runner;
  host0.send({ type: 'CREATE', codename: host0.codename });
  await waitFor(() => host0.playerId !== null, 10_000);

  for (let i = 1; i < runners.length; i++) {
    const r = runners[i] as Runner;
    r.send({ type: 'JOIN', code, codename: r.codename });
    await waitFor(() => r.playerId !== null, 10_000);
  }

  for (const r of runners) r.send({ type: 'SET_READY', ready: true });

  // The lobby countdown (COUNTDOWN_DURATION_MS, apps/party/src/state.ts) is
  // a real 10-second Durable Object alarm in `partykit dev` — there is no
  // fake-timer shortcut against a live server, so this script genuinely
  // waits it out once, before round 1.
  console.error('[measure-4p-timing] waiting for match to start (lobby countdown)…');
  await waitFor(() => runners.every((r) => r.agents.length > 0), 20_000);
  console.error('[measure-4p-timing] match started');

  const rows: RoundRow[] = [];

  for (let round = 1; round <= rounds; round++) {
    if (runners.some((r) => r.outcome !== null)) break;

    peakInFlightThisRound = 0;
    const roundStart = performance.now();
    const submitTimes = new Map<Runner, number>();

    for (const r of runners) {
      for (const agent of r.agents) {
        trackInFlight(1);
        submitTimes.set(r, performance.now());
        r.send({ type: 'SUBMIT_ORDER', round, agentId: agent.id, actions: [{ type: 'HOLD' }] });
      }
    }

    await waitFor(() => runners.every((r) => (r.ackAt.get(round) ?? 0) > 0 || r.agents.length === 0), 15_000);
    const lastOrderLandingAt = Math.max(...runners.map((r) => r.ackAt.get(round) ?? 0));
    const submitWindowMs = lastOrderLandingAt - roundStart;

    await waitFor(() => runners.every((r) => r.resolvedAt.has(round)), 30_000);
    const lastResolvedAt = Math.max(...runners.map((r) => r.resolvedAt.get(round) ?? 0));
    const resolveBroadcastMs = lastResolvedAt - lastOrderLandingAt;

    const perConnLatencyMs = runners
      .filter((r) => submitTimes.has(r))
      .map((r) => (r.ackAt.get(round) ?? 0) - (submitTimes.get(r) as number));

    const totalRoundMs = lastResolvedAt - roundStart;
    rows.push({
      round,
      submitWindowMs,
      resolveBroadcastMs,
      peakInFlight: peakInFlightThisRound,
      perConnLatencyMs,
      eventCount: (host0.eventCount.get(round) ?? 0),
      heldTimer: totalRoundMs < roundTimerSeconds * 1000,
    });
  }

  console.error('[measure-4p-timing] done, writing report');

  const lines: string[] = [];
  lines.push('# Four-player concurrent timing measurement');
  lines.push('');
  lines.push(`Room: \`${code}\` on \`${host}\`. ${rows.length} rounds recorded.`);
  lines.push('');
  lines.push(
    '| Round | Submit window (ms) | Resolve+broadcast (ms) | Peak in-flight | Per-conn RTT (ms) | Events | 90s timer held |',
  );
  lines.push('|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const rtt = row.perConnLatencyMs.map((v) => v.toFixed(1)).join(', ');
    lines.push(
      `| ${row.round} | ${row.submitWindowMs.toFixed(1)} | ${row.resolveBroadcastMs.toFixed(1)} | ${row.peakInFlight} | ${rtt} | ${row.eventCount} | ${row.heldTimer ? 'yes' : 'NO — timer exceeded'} |`,
    );
  }
  lines.push('');
  lines.push('Summary (min / median / max):');
  lines.push('');
  lines.push('| Metric | Min | Median | Max |');
  lines.push('|---|---|---|---|');
  lines.push(summaryRow('Submit window (ms)', rows.map((r) => r.submitWindowMs)));
  lines.push(summaryRow('Resolve+broadcast (ms)', rows.map((r) => r.resolveBroadcastMs)));
  lines.push(summaryRow('Peak in-flight', rows.map((r) => r.peakInFlight)));
  lines.push(summaryRow('Per-conn RTT (ms)', rows.flatMap((r) => r.perConnLatencyMs)));
  lines.push(summaryRow('Events/round', rows.map((r) => r.eventCount)));
  lines.push('');
  const allHeld = rows.every((r) => r.heldTimer);
  lines.push(
    allHeld
      ? `The 90-second round timer held for every one of ${rows.length} rounds — every round closed on commit, well inside the deadline.`
      : `The 90-second round timer did NOT hold for every round — see the "90s timer held" column above.`,
  );

  console.log(lines.join('\n'));

  for (const r of runners) r.close();
  process.exit(0);
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
