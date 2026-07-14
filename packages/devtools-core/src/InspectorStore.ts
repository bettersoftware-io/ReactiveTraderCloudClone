import type {
  AppToInspector,
  DevtoolsEvent,
  SnapshotMachine,
  SnapshotStream,
} from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";
import type { SerializedValue } from "./serialize";

const LOG_CAP = 5000;
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
 * ready: `apply()` mutates internal maps, then rebuilds the public state
 * object (a new top-level reference every apply) and notifies subscribers.
 * `getSnapshot()` returns the SAME reference until the next `apply()`. */
export class InspectorStore {
  private readonly streamEntries = new Map<string, StreamEntry>();

  private readonly machineEntries = new Map<string, MachineEntry>();

  private readonly logAll: LogRow[] = [];

  private readonly listeners = new Set<() => void>();

  private connected = false;

  private appId: string | null = null;

  private protocolMismatch: number | null = null;

  private state: InspectorState = INITIAL_STATE;

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

    this.rebuild();
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

  private rebuild(): void {
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

    for (const listener of this.listeners) {
      listener();
    }
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
