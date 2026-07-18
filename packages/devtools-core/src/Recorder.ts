import type { InspectorState } from "./InspectorStore";
import type {
  AppToInspector,
  SnapshotMachine,
  SnapshotStream,
} from "./protocol";
import { RECORDING_VERSION, type Recording } from "./recording";

const DEFAULT_MAX_FRAMES = 10000;

export interface RecorderOptions {
  /** Ring cap; on overflow the oldest frame is dropped and logged. */
  maxFrames?: number;
  /** Overflow notifier — no silent truncation. Defaults to console.warn. */
  log?: (message: string) => void;
}

/** Panel-side flight recorder. `start()` seeds a self-contained snapshot from
 * the live store's current state, then `capture()` appends every subsequent
 * AppToInspector message (tee'd off InspectorStore.tap()). The buffer is
 * bounded; overflow drops the oldest frame and logs it. */
export class Recorder {
  private readonly framesBuf: AppToInspector[] = [];

  private readonly cap: number;

  private readonly logFn: (message: string) => void;

  private isRecording = false;

  private appIdValue = "unknown";

  private startedAtValue = 0;

  private droppedCount = 0;

  constructor(options?: RecorderOptions) {
    this.cap = options?.maxFrames ?? DEFAULT_MAX_FRAMES;
    this.logFn = options?.log ?? defaultLog;
  }

  get recording(): boolean {
    return this.isRecording;
  }

  get frameCount(): number {
    return this.framesBuf.length;
  }

  /** Begin capturing. Seeds frame 0 with a synthetic snapshot built from the
   * live state so the recording is complete from the first frame; startedAt is
   * injected by the caller (never Date.now() here). */
  start(seedState: InspectorState, startedAt: number): void {
    this.framesBuf.length = 0;
    this.droppedCount = 0;
    this.appIdValue = seedState.appId ?? "unknown";
    this.startedAtValue = startedAt;
    this.framesBuf.push(seedSnapshot(seedState));
    this.isRecording = true;
  }

  capture(msg: AppToInspector): void {
    if (!this.isRecording) {
      return;
    }

    this.framesBuf.push(msg);

    if (this.framesBuf.length > this.cap) {
      this.framesBuf.shift();
      this.droppedCount += 1;
      this.logFn(
        `Recorder: buffer at cap ${this.cap}, dropped oldest frame (total dropped ${this.droppedCount})`,
      );
    }
  }

  stop(): void {
    this.isRecording = false;
  }

  toRecording(): Recording {
    if (this.framesBuf.length === 0) {
      throw new Error("Recorder: nothing recorded");
    }

    return {
      version: RECORDING_VERSION,
      appId: this.appIdValue,
      startedAt: this.startedAtValue,
      frames: this.framesBuf.slice(),
    };
  }
}

/** Project the live InspectorState back into a snapshot AppToInspector so a
 * recording always begins from a complete state. Emission counters/intents are
 * intentionally reset (a recording starts a fresh session view at record time,
 * not mid-stream) — snapshot has no place for them and the reducer rebuilds
 * them from the captured batches that follow. */
function seedSnapshot(state: InspectorState): AppToInspector {
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

function defaultLog(message: string): void {
  console.warn(message);
}
