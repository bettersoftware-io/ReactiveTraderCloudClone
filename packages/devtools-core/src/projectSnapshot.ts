import type { InspectorState } from "./InspectorStore";
import type {
  AppToInspector,
  SnapshotMachine,
  SnapshotStream,
} from "./protocol";

/** Project an InspectorState back into a snapshot AppToInspector so a
 * recording always begins from a complete state. Emission counters/intents are
 * intentionally reset (a recording starts a fresh session view at record time,
 * not mid-stream) — snapshot has no place for them and the reducer rebuilds
 * them from the captured batches that follow. */
export function projectSnapshot(state: InspectorState): AppToInspector {
  const streams: SnapshotStream[] = state.streams.map((s) => {
    return { streamId: s.streamId, value: s.lastValue };
  });

  const machines: SnapshotMachine[] = state.machines.map((m) => {
    return {
      machineId: m.machineId,
      machineKind: m.machineKind,
      args: m.args,
      state: m.state,
      disposed: m.disposed,
      createdAt: m.createdAt,
    };
  });

  return { kind: "snapshot", streams, machines };
}
