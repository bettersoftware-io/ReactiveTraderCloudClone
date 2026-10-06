import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

/** UI-thread frames one round waits: one for the commit to be mounted and
 * measured, one for what that reports to be sent, one for a canvas to draw. */
export const UI_FRAMES: number = 3;

/** JS frames waited after the UI thread answers, so events it sent just
 * before answering have been handled before React is asked to finish. */
export const JS_FRAMES: number = 2;

interface SceneSettled {
  /** True once a whole round has passed with no commit in the scene. */
  readonly settled: boolean;
  /** Counts a commit. Wire to a `<Profiler onRender>` around the scene. */
  recordCommit(): void;
}

/**
 * Tells when a mounted scene has stopped changing.
 *
 * A scene is not final on its first commit. `CandleChart` draws at a default
 * width, then its wrapper's `onLayout` reports the real one and a second
 * commit redraws it; anything that measures itself does the same. Those later
 * commits are answers from the UI thread, so that is what this waits on. A
 * round has three steps:
 *
 * 1. the UI thread runs {@link UI_FRAMES} of its own frames and calls back, so
 *    what the last commit caused there has been mounted, measured and sent;
 * 2. {@link JS_FRAMES} pass here, so those events have been handled;
 * 3. React finishes the renders those events asked for. Rendering is spread
 *    over many frames on a slow device, so this is not a frame count either:
 *    a state update is queued as a transition, the lowest priority there is,
 *    and React commits it only once everything more urgent has committed.
 *
 * If the scene committed during the round, another round starts; a round with
 * no commit means settled.
 *
 * Why not a count of quiet frames on this side. That was built first and
 * measured (2026-10-06, Pixel 10a emulator). At normal speed the last real
 * commit came at most 4 frames after the one before it; with the emulator
 * throttled 6-8x, up to 57. The frame clock here keeps ticking while the UI
 * thread and React are slow, so a count that is ample on a fast device is
 * short on a slow one, which is exactly when a capture lands on an unsettled
 * frame.
 *
 * What it does not promise: that nothing commits afterwards. Most scenes
 * commit once or twice more a second or two later (measured on both
 * platforms), and those commits change no pixel. A scene that never stops
 * committing never settles, and its capture times out waiting for the marker;
 * such a scene has no single frame to pin.
 */
export function useSceneSettled(mounted: boolean): SceneSettled {
  const [settled, setSettled] = useState(false);
  const [drains, setDrains] = useState(0);
  const commits = useRef(0);
  const resumeRound = useRef<(() => void) | null>(null);

  const recordCommit = useCallback((): void => {
    commits.current += 1;
  }, []);

  // Runs when the transition queued by a round has committed.
  useEffect(() => {
    if (drains === 0) {
      return;
    }

    const resume = resumeRound.current;

    resumeRound.current = null;
    resume?.();
  }, [drains]);

  useEffect(() => {
    if (!mounted) {
      return undefined;
    }

    let cancelled = false;

    function startRound(): void {
      const seen = commits.current;

      waitUiFrames(UI_FRAMES, () => {
        waitJsFrames(JS_FRAMES, () => {
          if (cancelled) {
            return;
          }

          resumeRound.current = endRound;
          startTransition(() => {
            setDrains((count) => {
              return count + 1;
            });
          });
        });
      });

      function endRound(): void {
        if (cancelled) {
          return;
        }

        if (commits.current === seen) {
          setSettled(true);
        } else {
          startRound();
        }
      }
    }

    startRound();

    return () => {
      cancelled = true;
    };
  }, [mounted]);

  return { settled, recordCommit };
}

/** Calls `done` on this thread after the UI thread has run `frames` frames. */
function waitUiFrames(frames: number, done: () => void): void {
  scheduleOnUI(() => {
    "worklet";
    let left = frames;

    function countFrame(): void {
      "worklet";
      left -= 1;

      if (left > 0) {
        requestAnimationFrame(countFrame);

        return;
      }

      scheduleOnRN(done);
    }

    requestAnimationFrame(countFrame);
  });
}

/** Calls `done` after `frames` animation frames on this thread. */
function waitJsFrames(frames: number, done: () => void): void {
  let left = frames;

  requestAnimationFrame(function countFrame(): void {
    left -= 1;

    if (left > 0) {
      requestAnimationFrame(countFrame);

      return;
    }

    done();
  });
}
