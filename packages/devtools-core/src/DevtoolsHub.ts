import type { Observable, Subscription } from "rxjs";

import type {
  AppToInspector,
  DevtoolsEvent,
  SnapshotMachine,
  SnapshotStream,
} from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";
import { serializeValue } from "./serialize";
import type { DevtoolsTransport } from "./transport";

export interface DevtoolsHubOptions {
  appId?: string;
  flushIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  ringBufferSize?: number;
}

interface StreamEntry {
  source$: Observable<unknown>;
  sub: Subscription | null;
}

interface MachineEntry {
  machineKind: string;
  args: readonly unknown[];
  state$: Observable<unknown>;
  sub: Subscription | null;
  lastState: unknown;
  hasState: boolean;
  disposed: boolean;
  createdAt: number;
}

interface Pending {
  value: unknown;
  count: number;
}

const MAX_DISPOSED_RETAINED = 500;

/** Central collector. Dormant = subscribed to nothing; registries only.
 * Live (after an inspector hello) = subscribed to every registered stream and
 * live machine state$, coalescing into 33ms batches. All app-facing entry
 * points are exception-safe: a devtools failure must never reach the app. */
export class DevtoolsHub {
  private readonly appId: string;

  private readonly flushIntervalMs: number;

  private readonly heartbeatTimeoutMs: number;

  private readonly ringBufferSize: number;

  private transport: DevtoolsTransport | null = null;

  private transportSub: Subscription | null = null;

  private readonly streams = new Map<string, StreamEntry>();

  private readonly machines = new Map<string, MachineEntry>();

  private disposedOrder: string[] = [];

  private nextMachineId = 1;

  private isLive = false;

  private seq = 0;

  private lastPingAt = 0;

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private pendingStreams = new Map<string, Pending>();

  private pendingMachineStates = new Map<string, Pending>();

  private pendingDiscrete: DevtoolsEvent[] = [];

  private readonly ring: DevtoolsEvent[] = [];

  constructor(options: DevtoolsHubOptions = {}) {
    this.appId = options.appId ?? "rtc";
    this.flushIntervalMs = options.flushIntervalMs ?? 33;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 10_000;
    this.ringBufferSize = options.ringBufferSize ?? 10_000;
  }

  get live(): boolean {
    return this.isLive;
  }

  attachTransport(transport: DevtoolsTransport): void {
    this.transport = transport;
    this.transportSub = transport.inbound$.subscribe((msg) => {
      try {
        if (msg.kind === "hello") {
          this.goLive();
        } else if (msg.kind === "ping") {
          this.lastPingAt = Date.now();
        } else if (msg.kind === "bye") {
          this.goDormant();
        }
      } catch (error) {
        this.reportError("transport.inbound", error);
      }
    });
  }

  registerStream(streamId: string, source$: Observable<unknown>): void {
    if (this.streams.has(streamId)) {
      return;
    }

    const entry: StreamEntry = { source$, sub: null };
    this.streams.set(streamId, entry);

    if (this.isLive) {
      this.pendingDiscrete.push(
        this.event({ kind: "stream:registered", streamId }),
      );
      this.subscribeStream(streamId, entry);
    }
  }

  machineCreated(
    machineKind: string,
    args: readonly unknown[],
    state$: Observable<unknown>,
  ): string {
    const machineId = `m${this.nextMachineId++}`;
    const entry: MachineEntry = {
      machineKind,
      args,
      state$,
      sub: null,
      lastState: undefined,
      hasState: false,
      disposed: false,
      createdAt: Date.now(),
    };
    this.machines.set(machineId, entry);

    if (this.isLive) {
      this.pendingDiscrete.push(
        this.event({
          kind: "machine:created",
          machineId,
          machineKind,
          args: serializeValue(args),
        }),
      );
      this.subscribeMachine(machineId, entry);
    }

    return machineId;
  }

  machineIntent(
    machineId: string,
    name: string,
    args: readonly unknown[],
  ): void {
    if (!this.isLive) {
      return;
    }

    this.pendingDiscrete.push(
      this.event({
        kind: "machine:intent",
        machineId,
        name,
        args: serializeValue(args),
      }),
    );
  }

  machineDisposed(machineId: string): void {
    const entry = this.machines.get(machineId);

    if (!entry || entry.disposed) {
      return;
    }

    entry.disposed = true;
    entry.sub?.unsubscribe();
    entry.sub = null;
    this.disposedOrder.push(machineId);

    if (this.disposedOrder.length > MAX_DISPOSED_RETAINED) {
      const evict = this.disposedOrder.shift();

      if (evict !== undefined) {
        this.machines.delete(evict);
      }
    }

    if (this.isLive) {
      this.pendingDiscrete.push(
        this.event({ kind: "machine:disposed", machineId }),
      );
    }
  }

  wireIn(msgType: string, payload: unknown): void {
    this.wire("wire:in", msgType, payload);
  }

  wireOut(msgType: string, payload: unknown): void {
    this.wire("wire:out", msgType, payload);
  }

  reportError(context: string, error: unknown): void {
    if (!this.isLive) {
      return;
    }

    try {
      this.pendingDiscrete.push(
        this.event({ kind: "devtools:error", context, message: String(error) }),
      );
    } catch {
      // deliberately unreachable-in-practice; never rethrow toward the app
    }
  }

  dispose(): void {
    this.goDormant();
    this.transportSub?.unsubscribe();
    this.transport?.dispose();
    this.transport = null;
  }

  private wire(
    kind: "wire:in" | "wire:out",
    msgType: string,
    payload: unknown,
  ): void {
    if (!this.isLive) {
      return;
    }

    try {
      this.pendingDiscrete.push(
        this.event({ kind, msgType, payload: serializeValue(payload) }),
      );
    } catch (error) {
      this.reportError("wire", error);
    }
  }

  private event<T extends Omit<DevtoolsEvent, "seq" | "ts">>(
    body: T,
  ): DevtoolsEvent {
    return {
      ...body,
      seq: this.seq++,
      ts: Date.now(),
    } as unknown as DevtoolsEvent;
  }

  private goLive(): void {
    if (this.isLive) {
      // re-hello from a reloaded panel: resend welcome + fresh snapshot
      this.sendWelcomeAndSnapshot();
      this.lastPingAt = Date.now();
      return;
    }

    this.isLive = true;
    this.lastPingAt = Date.now();

    // Subscribing state-backed sources emits synchronously → lands in pending,
    // which sendWelcomeAndSnapshot() drains into the snapshot message.
    for (const [id, entry] of this.streams) {
      this.subscribeStream(id, entry);
    }

    for (const [id, entry] of this.machines) {
      if (!entry.disposed) {
        this.subscribeMachine(id, entry);
      }
    }

    this.sendWelcomeAndSnapshot();
    this.flushTimer = setInterval(() => {
      this.flush();

      if (Date.now() - this.lastPingAt > this.heartbeatTimeoutMs) {
        this.goDormant();
      }
    }, this.flushIntervalMs);
  }

  private goDormant(): void {
    if (!this.isLive) {
      return;
    }

    this.isLive = false;

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    for (const entry of this.streams.values()) {
      entry.sub?.unsubscribe();
      entry.sub = null;
    }

    for (const entry of this.machines.values()) {
      entry.sub?.unsubscribe();
      entry.sub = null;
    }

    this.pendingStreams.clear();
    this.pendingMachineStates.clear();
    this.pendingDiscrete = [];
    this.ring.length = 0;

    try {
      this.transport?.send({ kind: "bye" });
    } catch {
      // panel already gone — nothing to tell
    }
  }

  private subscribeStream(streamId: string, entry: StreamEntry): void {
    entry.sub = entry.source$.subscribe({
      next: (value: unknown): void => {
        const p = this.pendingStreams.get(streamId);

        if (p) {
          p.value = value;
          p.count += 1;
        } else {
          this.pendingStreams.set(streamId, { value, count: 1 });
        }
      },
      error: (error: unknown): void => {
        this.reportError(`stream:${streamId}`, error);
      },
    });
  }

  private subscribeMachine(machineId: string, entry: MachineEntry): void {
    entry.sub = entry.state$.subscribe({
      next: (state: unknown): void => {
        entry.lastState = state;
        entry.hasState = true;
        const p = this.pendingMachineStates.get(machineId);

        if (p) {
          p.value = state;
          p.count += 1;
        } else {
          this.pendingMachineStates.set(machineId, { value: state, count: 1 });
        }
      },
      error: (error: unknown): void => {
        this.reportError(`machine:${machineId}`, error);
      },
    });
  }

  private sendWelcomeAndSnapshot(): void {
    const streams: SnapshotStream[] = [];

    for (const [streamId] of this.streams) {
      const p = this.pendingStreams.get(streamId);
      streams.push({
        streamId,
        value: p ? serializeValue(p.value) : null,
      });
    }

    const machines: SnapshotMachine[] = [];

    for (const [machineId, entry] of this.machines) {
      const p = this.pendingMachineStates.get(machineId);
      const state = p ? p.value : entry.hasState ? entry.lastState : undefined;
      machines.push({
        machineId,
        machineKind: entry.machineKind,
        args: serializeValue(entry.args),
        state: state === undefined ? null : serializeValue(state),
        disposed: entry.disposed,
        createdAt: entry.createdAt,
      });
    }

    // The synchronous first emissions became the snapshot — don't re-send them.
    this.pendingStreams.clear();
    this.pendingMachineStates.clear();
    this.send({ kind: "welcome", v: PROTOCOL_VERSION, appId: this.appId });
    this.send({ kind: "snapshot", streams, machines });
  }

  private flush(): void {
    if (
      this.pendingStreams.size === 0 &&
      this.pendingMachineStates.size === 0 &&
      this.pendingDiscrete.length === 0
    ) {
      return;
    }

    const events: DevtoolsEvent[] = [...this.pendingDiscrete];
    this.pendingDiscrete = [];

    for (const [streamId, p] of this.pendingStreams) {
      events.push(
        this.event({
          kind: "stream:emission",
          streamId,
          value: serializeValue(p.value),
          coalesced: p.count,
        }),
      );
    }

    this.pendingStreams.clear();

    for (const [machineId, p] of this.pendingMachineStates) {
      events.push(
        this.event({
          kind: "machine:state",
          machineId,
          state: serializeValue(p.value),
          coalesced: p.count,
        }),
      );
    }

    this.pendingMachineStates.clear();

    for (const ev of events) {
      this.ring.push(ev);
    }

    if (this.ring.length > this.ringBufferSize) {
      this.ring.splice(0, this.ring.length - this.ringBufferSize);
    }

    this.send({ kind: "batch", events });
  }

  private send(msg: AppToInspector): void {
    try {
      this.transport?.send(msg);
    } catch (error) {
      // transport failure must never surface into the app; drop and continue
      void error;
    }
  }
}
