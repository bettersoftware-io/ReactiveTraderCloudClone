import type {
  AppToInspector,
  DevtoolsEvent,
  SnapshotMachine,
  SnapshotStream,
} from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";
import type { SerializedValue } from "./serialize";

const LOG_CAP = 5000;
const MAX_DISPOSED_MACHINES = 500;
const MAX_STREAMS = 2000;
const SUMMARY_VALUE_MAX = 120;
const RATE_WINDOW_MS = 2000;

export interface StreamRow {
  streamId: string;
  lastValue: SerializedValue | null;
  /** 0 until first emission; drives change-flash keys. */
  lastSeq: number;
  totalEmissions: number;
  /** Decayed rolling estimate from coalesced counters. */
  ratePerSec: number;
}

export interface MachineIntentRow {
  name: string;
  args: SerializedValue;
  ts: number;
}

export interface MachineRow {
  machineId: string;
  machineKind: string;
  args: SerializedValue;
  state: SerializedValue | null;
  disposed: boolean;
  createdAt: number;
  intents: readonly MachineIntentRow[];
  transitions: number;
}

export interface LogRow {
  seq: number;
  ts: number;
  kind: DevtoolsEvent["kind"];
  /** One-line preformatted text for the log panel. */
  summary: string;
  event: DevtoolsEvent;
}

export interface InspectorState {
  connected: boolean;
  appId: string | null;
  /** The app's version when it differs from PROTOCOL_VERSION; null when matched. */
  protocolMismatch: number | null;
  streams: readonly StreamRow[];
  machines: readonly MachineRow[];
  /** Newest last, capped at 5000. */
  log: readonly LogRow[];
}

interface RateWindow {
  windowStart: number | null;
  windowCount: number;
}

interface StreamEntry {
  streamId: string;
  lastValue: SerializedValue | null;
  lastSeq: number;
  totalEmissions: number;
  ratePerSec: number;
  rate: RateWindow;
}

interface MachineEntry {
  machineId: string;
  machineKind: string;
  args: SerializedValue;
  state: SerializedValue | null;
  disposed: boolean;
  createdAt: number;
  intents: readonly MachineIntentRow[];
  transitions: number;
}

const INITIAL_STATE: InspectorState = {
  connected: false,
  appId: null,
  protocolMismatch: null,
  streams: [],
  machines: [],
  log: [],
};

/** Panel-side reducer: consumes `AppToInspector` messages and folds them into
 * a render-ready `InspectorState`. Copy-on-write and `useSyncExternalStore`-
 * ready. `apply()` mutates internal maps (cheap) and marks the store dirty;
 * the expensive public `InspectorState` rebuild AND the subscriber
 * notification are COALESCED into a single flush per animation frame. The app
 * streams ~30 batches/s, but the panel's React tree only needs to repaint once
 * per frame, and rAF naturally throttles under CPU pressure instead of letting
 * renders stack up and starve the main thread. Crucially, `getSnapshot()`
 * returns the last-flushed state and is STABLE between flushes — a snapshot
 * that changed on every apply would make `useSyncExternalStore` re-render in a
 * tight loop as its post-commit consistency check kept seeing new data. In a
 * non-DOM environment (tests, SSR) there is no frame loop, so the flush runs
 * synchronously on apply — reads are immediately fresh and coalescing is a
 * no-op (it only matters against a real 60 Hz render loop). */
export class InspectorStore {
  private readonly streamEntries = new Map<string, StreamEntry>();

  private readonly machineEntries = new Map<string, MachineEntry>();

  private readonly logAll: LogRow[] = [];

  private readonly listeners = new Set<() => void>();

  private connected = false;

  private appId: string | null = null;

  private protocolMismatch: number | null = null;

  private state: InspectorState = INITIAL_STATE;

  private dirty = false;

  private flushScheduled = false;

  private framesWaited = 0;

  /** Repaint the whole tree at most ~15×/s (once per this many 60 Hz frames)
   * rather than on every frame. A human-read state inspector gains nothing
   * from 60 fps, and rebuilding + re-rendering the full tree that often is what
   * saturates the main thread under a live stream. */
  private static readonly FRAMES_PER_FLUSH = 4;

  /** Bound retained disposed machines the way the hub does (MAX_DISPOSED_RETAINED)
   * so a long session's machine table and memory stay flat. Insertion order in a
   * Map is stable, so the first disposed entries found are the oldest. */
  private evictDisposedMachines(): void {
    const disposedIds: string[] = [];

    for (const [id, entry] of this.machineEntries) {
      if (entry.disposed) {
        disposedIds.push(id);
      }
    }

    const overflow = disposedIds.length - MAX_DISPOSED_MACHINES;

    for (let i = 0; i < overflow; i++) {
      const id = disposedIds[i];

      if (id) {
        this.machineEntries.delete(id);
      }
    }
  }

  /** Oldest-inserted stream eviction — a safety bound; the real app has a finite
   * set of presenter/parameterized streams, so this only fires on pathological
   * churn. */
  private capStreams(): void {
    const overflow = this.streamEntries.size - MAX_STREAMS;

    if (overflow <= 0) {
      return;
    }

    const it = this.streamEntries.keys();

    for (let i = 0; i < overflow; i++) {
      const next = it.next();

      if (!next.done) {
        this.streamEntries.delete(next.value);
      }
    }
  }

  getSnapshot(): InspectorState {
    return this.state;
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);

    return (): void => {
      this.listeners.delete(onChange);
    };
  }

  apply(msg: AppToInspector): void {
    switch (msg.kind) {
      case "welcome": {
        this.connected = true;
        this.appId = msg.appId;
        this.protocolMismatch = msg.v === PROTOCOL_VERSION ? null : msg.v;
        break;
      }

      case "snapshot": {
        this.applySnapshot(msg.streams, msg.machines);
        break;
      }

      case "batch": {
        for (const event of msg.events) {
          this.applyEvent(event);
        }

        break;
      }

      case "bye": {
        this.connected = false;
        break;
      }
    }

    // Mutations landed in the maps above; the public snapshot rebuild + the
    // subscriber notification are coalesced into one flush for this frame.
    this.dirty = true;
    this.scheduleFlush();
  }

  private applySnapshot(
    streams: readonly SnapshotStream[],
    machines: readonly SnapshotMachine[],
  ): void {
    this.streamEntries.clear();

    for (const s of streams) {
      this.streamEntries.set(s.streamId, {
        streamId: s.streamId,
        lastValue: s.value,
        lastSeq: 0,
        totalEmissions: 0,
        ratePerSec: 0,
        rate: { windowStart: null, windowCount: 0 },
      });
    }

    this.machineEntries.clear();

    for (const m of machines) {
      this.machineEntries.set(m.machineId, {
        machineId: m.machineId,
        machineKind: m.machineKind,
        args: m.args,
        state: m.state,
        disposed: m.disposed,
        createdAt: m.createdAt,
        intents: [],
        transitions: 0,
      });
    }
  }

  private applyEvent(event: DevtoolsEvent): void {
    switch (event.kind) {
      case "stream:registered": {
        if (!this.streamEntries.has(event.streamId)) {
          this.streamEntries.set(event.streamId, {
            streamId: event.streamId,
            lastValue: null,
            lastSeq: 0,
            totalEmissions: 0,
            ratePerSec: 0,
            rate: { windowStart: null, windowCount: 0 },
          });
          this.capStreams();
        }

        break;
      }

      case "stream:emission": {
        const entry = this.streamEntry(event.streamId);
        entry.lastValue = event.value;
        entry.lastSeq = event.seq;
        entry.totalEmissions += event.coalesced;
        this.updateRate(entry, event.ts, event.coalesced);
        break;
      }

      case "machine:created": {
        this.machineEntries.set(event.machineId, {
          machineId: event.machineId,
          machineKind: event.machineKind,
          args: event.args,
          state: null,
          disposed: false,
          createdAt: event.ts,
          intents: [],
          transitions: 0,
        });
        break;
      }

      case "machine:state": {
        const entry = this.machineEntries.get(event.machineId);

        if (entry) {
          entry.state = event.state;
          entry.transitions += 1;
        }

        break;
      }

      case "machine:intent": {
        const entry = this.machineEntries.get(event.machineId);

        if (entry) {
          entry.intents = [
            ...entry.intents,
            { name: event.name, args: event.args, ts: event.ts },
          ];
        }

        break;
      }

      case "machine:disposed": {
        const entry = this.machineEntries.get(event.machineId);

        if (entry) {
          entry.disposed = true;
          this.evictDisposedMachines();
        }

        break;
      }

      case "wire:in":
      case "wire:out":

      case "devtools:error": {
        break;
      }
    }

    this.appendLog(event);
  }

  private streamEntry(streamId: string): StreamEntry {
    const existing = this.streamEntries.get(streamId);

    if (existing) {
      return existing;
    }

    const entry: StreamEntry = {
      streamId,
      lastValue: null,
      lastSeq: 0,
      totalEmissions: 0,
      ratePerSec: 0,
      rate: { windowStart: null, windowCount: 0 },
    };
    this.streamEntries.set(streamId, entry);
    this.capStreams();

    return entry;
  }

  private updateRate(entry: StreamEntry, ts: number, coalesced: number): void {
    if (entry.rate.windowStart === null) {
      entry.rate.windowStart = ts;
      entry.rate.windowCount = coalesced;
      return;
    }

    entry.rate.windowCount += coalesced;
    const elapsed = ts - entry.rate.windowStart;

    if (elapsed > RATE_WINDOW_MS) {
      entry.ratePerSec = entry.rate.windowCount / (elapsed / 1000);
      entry.rate.windowStart = ts;
      entry.rate.windowCount = 0;
    }
  }

  private appendLog(event: DevtoolsEvent): void {
    this.logAll.push({
      seq: event.seq,
      ts: event.ts,
      kind: event.kind,
      summary: summarize(event),
      event,
    });

    if (this.logAll.length > LOG_CAP) {
      this.logAll.splice(0, this.logAll.length - LOG_CAP);
    }
  }

  /** Coalesce the rebuild + notify into one throttled flush (~15 Hz). Repeated
   * applies before the flush fires collapse into a single flush — the whole
   * point. Driven by rAF (not setInterval) so it throttles under load and
   * pauses while the tab is hidden; with no frame loop (tests, SSR) there is
   * nothing to coalesce against, so the flush runs synchronously and reads stay
   * fresh. */
  private scheduleFlush(): void {
    if (typeof requestAnimationFrame !== "function") {
      this.flush();

      return;
    }

    if (this.flushScheduled) {
      return;
    }

    this.flushScheduled = true;
    this.framesWaited = 0;

    const step = (): void => {
      this.framesWaited += 1;

      if (this.framesWaited < InspectorStore.FRAMES_PER_FLUSH) {
        requestAnimationFrame(step);

        return;
      }

      this.flushScheduled = false;
      this.flush();
    };

    requestAnimationFrame(step);
  }

  /** Rebuild the public snapshot (only if dirty) and notify subscribers. This
   * is the ONLY place `this.state` is reassigned, so getSnapshot() is stable
   * between flushes. */
  private flush(): void {
    if (this.dirty) {
      this.rebuildState();
      this.dirty = false;
    }

    for (const listener of this.listeners) {
      listener();
    }
  }

  private rebuildState(): void {
    const streams = [...this.streamEntries.values()]
      .map((e): StreamRow => {
        return {
          streamId: e.streamId,
          lastValue: e.lastValue,
          lastSeq: e.lastSeq,
          totalEmissions: e.totalEmissions,
          ratePerSec: e.ratePerSec,
        };
      })
      .sort((a, b) => {
        return a.streamId < b.streamId ? -1 : a.streamId > b.streamId ? 1 : 0;
      });

    const machines = [...this.machineEntries.values()].map((e): MachineRow => {
      return {
        machineId: e.machineId,
        machineKind: e.machineKind,
        args: e.args,
        state: e.state,
        disposed: e.disposed,
        createdAt: e.createdAt,
        intents: e.intents,
        transitions: e.transitions,
      };
    });

    this.state = {
      connected: this.connected,
      appId: this.appId,
      protocolMismatch: this.protocolMismatch,
      streams,
      machines,
      log: this.logAll.slice(),
    };
  }
}

function compactValue(value: SerializedValue): string {
  const json = JSON.stringify(value);

  if (json.length > SUMMARY_VALUE_MAX) {
    return `${json.slice(0, SUMMARY_VALUE_MAX)}…`;
  }

  return json;
}

function summarize(event: DevtoolsEvent): string {
  switch (event.kind) {
    case "stream:registered": {
      return `${event.streamId} registered`;
    }

    case "stream:emission": {
      return `${event.streamId} ${compactValue(event.value)} ×${event.coalesced}`;
    }

    case "machine:created": {
      return `${event.machineId} created (${event.machineKind})`;
    }

    case "machine:state": {
      return `${event.machineId} ${compactValue(event.state)} ×${event.coalesced}`;
    }

    case "machine:intent": {
      return `${event.machineId} → ${event.name}(${compactValue(event.args)})`;
    }

    case "machine:disposed": {
      return `${event.machineId} disposed`;
    }

    case "wire:in":

    case "wire:out": {
      return `${event.msgType} ${compactValue(event.payload)}`;
    }

    case "devtools:error": {
      return `${event.context}: ${event.message}`;
    }
  }
}
