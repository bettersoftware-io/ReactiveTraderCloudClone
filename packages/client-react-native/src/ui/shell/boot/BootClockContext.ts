// packages/client-react-native/src/ui/shell/boot/BootClockContext.ts
import { createContext } from "react";
import type { SharedValue } from "react-native-reanimated";

/** A pinned boot clock the visual harness injects so `BootCanvas` draws one
 * fixed instant instead of advancing `elapsedSec` off its live UI-thread
 * frame callback (and sampling the wall clock, which only `TopoScene`
 * prints). The same seam shape as `ActiveModuleContext`: `null` in
 * production ⇒ the frame callback and the gyroscope drive the scene, as they
 * always have. Pinning here rather than in a test-only copy of the canvas is
 * what lets a golden hold the REAL `BootSequence` — chrome, emblem gate and
 * canvas together — rather than a harness re-composition of it. */
export const BootClockContext = createContext<BootClockPin | null>(null);

export interface BootClockPin {
  /** The scene's `elapsedSec`, held at one value for the whole capture. */
  readonly elapsedSec: SharedValue<number>;
  /** The wall-clock instant a scene may print (`BootSceneProps.now`). */
  readonly now: Date;
}
