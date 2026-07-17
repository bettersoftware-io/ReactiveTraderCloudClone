import type { InspectorState } from "./InspectorStore";
import { InspectorStore } from "./InspectorStore";
import type { AppToInspector } from "./protocol";
import type { Recording } from "./recording";

const DEFAULT_CHECKPOINT_INTERVAL = 500;

export interface ReplayControllerOptions {
  /** Cache a cloned, folded store every N frames so backward scrubbing folds
   * at most N frames instead of re-folding from 0. */
  checkpointInterval?: number;
}

interface Checkpoint {
  /** Last frame index folded into `store` (>= 0); -1 for the empty base. */
  index: number;
  store: InspectorStore;
}

/** Drives a Recording's frames back into a reconstructed InspectorState at any
 * index. The fold engine is a real (synchronous) InspectorStore, so stateAt(k)
 * is identical to a live fold of the same frames. Periodic checkpoints keep
 * scrubbing responsive. Never touches the live store or the app. */
export class ReplayController {
  private readonly frames: readonly AppToInspector[];

  private readonly startedAt: number;

  private readonly checkpointInterval: number;

  private readonly checkpoints: readonly Checkpoint[];

  private readonly frameTs: readonly number[];

  private lastFoldCountValue = 0;

  constructor(recording: Recording, options?: ReplayControllerOptions) {
    this.frames = recording.frames;
    this.startedAt = recording.startedAt;
    this.checkpointInterval = Math.max(
      1,
      options?.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL,
    );
    this.checkpoints = this.buildCheckpoints();
    this.frameTs = this.buildFrameTs();
  }

  get length(): number {
    return this.frames.length;
  }

  get lastFoldCount(): number {
    return this.lastFoldCountValue;
  }

  stateAt(frameIndex: number): InspectorState {
    const clamped = this.clampIndex(frameIndex);
    const base = this.nearestCheckpoint(clamped);
    const working = base.store.clone();
    let folded = 0;

    for (const frame of this.frames.slice(base.index + 1, clamped + 1)) {
      working.apply(frame);
      folded += 1;
    }

    this.lastFoldCountValue = folded;

    return working.getSnapshot();
  }

  tsAt(frameIndex: number): number {
    const clamped = this.clampIndex(frameIndex);

    if (clamped < 0) {
      return this.startedAt;
    }

    return this.frameTs[clamped] ?? this.startedAt;
  }

  private clampIndex(frameIndex: number): number {
    if (this.frames.length === 0) {
      return -1;
    }

    return Math.max(0, Math.min(frameIndex, this.frames.length - 1));
  }

  private nearestCheckpoint(index: number): Checkpoint {
    const base = this.checkpoints[0];

    if (base === undefined) {
      throw new Error("ReplayController: no base checkpoint");
    }

    let best = base;

    for (const cp of this.checkpoints) {
      if (cp.index <= index && cp.index >= best.index) {
        best = cp;
      }
    }

    return best;
  }

  private buildCheckpoints(): Checkpoint[] {
    const working = new InspectorStore({ coalesce: false });
    // Base checkpoint: an empty store before any frame is folded.
    const checkpoints: Checkpoint[] = [{ index: -1, store: working.clone() }];

    for (let i = 0; i < this.frames.length; i += 1) {
      const frame = this.frames[i];

      if (frame === undefined) {
        continue;
      }

      working.apply(frame);

      if ((i + 1) % this.checkpointInterval === 0) {
        checkpoints.push({ index: i, store: working.clone() });
      }
    }

    return checkpoints;
  }

  private buildFrameTs(): number[] {
    const out: number[] = [];
    let ts = this.startedAt;

    for (const frame of this.frames) {
      if (frame.kind === "batch") {
        for (const event of frame.events) {
          if (event.ts > ts) {
            ts = event.ts;
          }
        }
      }

      out.push(ts);
    }

    return out;
  }
}
