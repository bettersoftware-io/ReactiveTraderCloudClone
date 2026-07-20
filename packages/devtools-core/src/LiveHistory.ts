import type { InspectorState } from "./InspectorStore";
import { InspectorStore } from "./InspectorStore";
import { projectSnapshot } from "./projectSnapshot";
import type { AppToInspector } from "./protocol";
import { RECORDING_VERSION, type Recording } from "./recording";

const DEFAULT_MAX_EVENTS = 20_000;
const DEFAULT_CHECKPOINT_INTERVAL = 500;

export interface LiveHistoryOptions {
  /** Rolling window cap, counted in DevtoolsEvents (not frames). Oldest
   * frames fold into the base and trim off past this. Infinity = never trim
   * (used for imported recordings). */
  maxEvents?: number;
  /** Frames between checkpoint clones. */
  checkpointInterval?: number;
}

interface FrameEntry {
  msg: AppToInspector;
  /** Highest event seq folded up to and including this frame. Batches advance
   * it; welcome/snapshot/bye frames inherit the running value — seq order is
   * the time axis, and a non-batch frame "happens at" the last seen seq. */
  maxSeq: number;
  eventCount: number;
}

interface HistoryCheckpoint {
  maxSeq: number;
  /** Absolute count of frames (since construction) folded into `store`. */
  foldedFrames: number;
  store: InspectorStore;
}

/** Always-on rolling time-travel buffer. Tees off InspectorStore.tap() (the
 * same point Recorder tees), keeps a bounded frame window plus periodic
 * checkpoint clones, and reconstructs the InspectorState as of any retained
 * seq. The fold engine is the real InspectorStore (trackLog: false — the
 * reconstructed state serves streams+machines only), so stateAt(seq) is
 * identical to a live fold of the same events by construction. */
export class LiveHistory {
  private readonly base = newFoldStore();

  private readonly cursor = newFoldStore();

  private readonly frames: FrameEntry[] = [];

  private readonly checkpoints: HistoryCheckpoint[] = [];

  private readonly maxEvents: number;

  private readonly checkpointInterval: number;

  private baseMaxSeq = 0;

  private totalEvents = 0;

  private trimmedFrames = 0;

  private recordedFrames = 0;

  private framesSinceCheckpoint = 0;

  private firstTsValue: number | null = null;

  constructor(options?: LiveHistoryOptions) {
    this.maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.checkpointInterval = Math.max(
      1,
      options?.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL,
    );
  }

  static fromRecording(
    recording: Recording,
    options?: LiveHistoryOptions,
  ): LiveHistory {
    const history = new LiveHistory({
      maxEvents: Number.POSITIVE_INFINITY,
      checkpointInterval: options?.checkpointInterval,
    });

    for (const frame of recording.frames) {
      history.record(frame);
    }

    return history;
  }

  get oldestSeq(): number {
    return this.baseMaxSeq;
  }

  get latestSeq(): number {
    return this.frames.at(-1)?.maxSeq ?? this.baseMaxSeq;
  }

  get eventCount(): number {
    return this.totalEvents;
  }

  get firstTs(): number | null {
    return this.firstTsValue;
  }

  record(msg: AppToInspector): void {
    const events = msg.kind === "batch" ? msg.events : [];
    let maxSeq = this.latestSeq;

    for (const event of events) {
      if (event.seq > maxSeq) {
        maxSeq = event.seq;
      }

      if (this.firstTsValue === null) {
        this.firstTsValue = event.ts;
      }
    }

    this.frames.push({ msg, maxSeq, eventCount: events.length });
    this.recordedFrames += 1;
    this.totalEvents += events.length;
    this.cursor.apply(msg);
    this.framesSinceCheckpoint += 1;

    if (this.framesSinceCheckpoint >= this.checkpointInterval) {
      this.checkpoints.push({
        maxSeq,
        foldedFrames: this.recordedFrames,
        store: this.cursor.clone(),
      });
      this.framesSinceCheckpoint = 0;
    }

    this.trim();
  }

  stateAt(seq: number): InspectorState {
    const target = Math.max(this.oldestSeq, Math.min(seq, this.latestSeq));
    const start = this.nearestStart(target);
    const working = start.store.clone();

    for (
      let i = start.foldedFrames - this.trimmedFrames;
      i < this.frames.length;
      i += 1
    ) {
      const frame = this.frames[i];

      if (frame === undefined) {
        continue;
      }

      if (frame.maxSeq <= target) {
        working.apply(frame.msg);
        continue;
      }

      if (frame.msg.kind === "batch") {
        working.apply({
          kind: "batch",
          events: frame.msg.events.filter((e) => {
            return e.seq <= target;
          }),
        });
      }

      break;
    }

    return working.getSnapshot();
  }

  toRecording(appId: string, startedAt: number): Recording {
    return {
      version: RECORDING_VERSION,
      appId,
      startedAt,
      frames: [
        projectSnapshot(this.base.getSnapshot()),
        ...this.frames.map((f) => {
          return f.msg;
        }),
      ],
    };
  }

  private nearestStart(target: number): HistoryCheckpoint {
    let best: HistoryCheckpoint = {
      maxSeq: this.baseMaxSeq,
      foldedFrames: this.trimmedFrames,
      store: this.base,
    };

    for (const cp of this.checkpoints) {
      if (cp.maxSeq <= target && cp.foldedFrames >= best.foldedFrames) {
        best = cp;
      }
    }

    return best;
  }

  private trim(): void {
    while (this.totalEvents > this.maxEvents && this.frames.length > 1) {
      const oldest = this.frames.shift();

      if (oldest === undefined) {
        break;
      }

      this.base.apply(oldest.msg);
      this.baseMaxSeq = oldest.maxSeq;
      this.totalEvents -= oldest.eventCount;
      this.trimmedFrames += 1;
    }

    // Checkpoints whose folded prefix now lies inside the base are useless
    // (no reachable seq needs them) — drop so memory stays flat.
    while (this.checkpoints.length > 0) {
      const head = this.checkpoints[0];

      if (head !== undefined && head.foldedFrames <= this.trimmedFrames) {
        this.checkpoints.shift();
      } else {
        break;
      }
    }
  }
}

function newFoldStore(): InspectorStore {
  return new InspectorStore({ coalesce: false, trackLog: false });
}
