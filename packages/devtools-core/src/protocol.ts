import type { SerializedValue } from "./serialize";

export const PROTOCOL_VERSION = 1;

interface EventBase {
  /** Monotonic per-hub sequence number. */
  seq: number;
  /** Epoch ms at capture. */
  ts: number;
}

export type StreamRegisteredEvent = EventBase & {
  kind: "stream:registered";
  streamId: string;
};

export type StreamEmissionEvent = EventBase & {
  kind: "stream:emission";
  streamId: string;
  value: SerializedValue;
  /** Emissions coalesced into this event within the flush window (≥1). */
  coalesced: number;
};

export type MachineCreatedEvent = EventBase & {
  kind: "machine:created";
  machineId: string;
  machineKind: string;
  args: SerializedValue;
};

export type MachineStateEvent = EventBase & {
  kind: "machine:state";
  machineId: string;
  state: SerializedValue;
  coalesced: number;
};

export type MachineIntentEvent = EventBase & {
  kind: "machine:intent";
  machineId: string;
  name: string;
  args: SerializedValue;
};

export type MachineDisposedEvent = EventBase & {
  kind: "machine:disposed";
  machineId: string;
};

export type WireEvent = EventBase & {
  kind: "wire:in" | "wire:out";
  msgType: string;
  payload: SerializedValue;
};

export type DevtoolsErrorEvent = EventBase & {
  kind: "devtools:error";
  context: string;
  message: string;
};

export type DevtoolsEvent =
  | StreamRegisteredEvent
  | StreamEmissionEvent
  | MachineCreatedEvent
  | MachineStateEvent
  | MachineIntentEvent
  | MachineDisposedEvent
  | WireEvent
  | DevtoolsErrorEvent;

export interface SnapshotStream {
  streamId: string;
  value: SerializedValue | null;
}

export interface SnapshotMachine {
  machineId: string;
  machineKind: string;
  args: SerializedValue;
  state: SerializedValue | null;
  disposed: boolean;
  createdAt: number;
}

export type AppToInspector =
  | { kind: "welcome"; v: number; appId: string }
  | {
      kind: "snapshot";
      streams: readonly SnapshotStream[];
      machines: readonly SnapshotMachine[];
    }
  | { kind: "batch"; events: readonly DevtoolsEvent[] }
  | { kind: "bye" };

export type InspectorToApp =
  | { kind: "hello"; v: number }
  | { kind: "ping" }
  | { kind: "bye" };

/** Which members of a presenter the instrumentation should register.
 * `props` — observable-valued properties (e.g. blotter `trades$`).
 * `methods` — parameterized stream methods (e.g. priceStream `price$(pair)`);
 * each distinct arg tuple registers a child stream on first call.
 * `machine` — the entry is a shared Machine (state$ registered, intents logged). */
export interface PresenterManifestEntry {
  props?: readonly string[];
  methods?: readonly string[];
  machine?: boolean;
}

export type PresenterManifest = Record<string, PresenterManifestEntry>;
