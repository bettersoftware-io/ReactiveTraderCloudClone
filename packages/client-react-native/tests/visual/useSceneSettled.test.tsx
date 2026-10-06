import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { act, render, renderHook, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { JS_FRAMES, UI_FRAMES, useSceneSettled } from "./useSceneSettled";
import { VisualScenarioHost } from "./VisualScenarioHost";

test("a scene that never commits again settles after one round", async () => {
  const { result } = await renderHook(() => {
    return useSceneSettled(true);
  });

  await passFrames(ROUND - 1);
  expect(result.current.settled).toBe(false);

  await passFrames(1);
  expect(result.current.settled).toBe(true);
});

// The defect this replaces: ready was raised one frame after mount, and a
// commit that came later (a chart redrawn at its measured width) was shot
// half-way.
test("a commit during a round costs another whole round", async () => {
  const { result } = await renderHook(() => {
    return useSceneSettled(true);
  });

  await passFrames(ROUND - 1);
  await commitOnce(result.current.recordCommit);

  await passFrames(ROUND);
  expect(result.current.settled).toBe(false);

  await passFrames(1);
  expect(result.current.settled).toBe(true);
});

// No single frame to pin: the capture is left to time out on the marker.
test("a scene that commits in every round never settles", async () => {
  const { result } = await renderHook(() => {
    return useSceneSettled(true);
  });

  for (let round = 0; round < 4; round += 1) {
    await commitOnce(result.current.recordCommit);
    await passFrames(ROUND);
  }

  expect(result.current.settled).toBe(false);
});

test("nothing is asked of either thread before the scene is mounted", async () => {
  const { result } = await renderHook(() => {
    return useSceneSettled(false);
  });

  expect(frames.pending()).toBe(0);
  await passFrames(ROUND * 2);
  expect(result.current.settled).toBe(false);
});

test("the first round starts when the scene mounts, not when the hook does", async () => {
  const { result, rerender } = await renderHook(
    ({ mounted }: MountedProps) => {
      return useSceneSettled(mounted);
    },
    { initialProps: { mounted: false } },
  );

  await passFrames(ROUND);
  await rerender({ mounted: true });
  await passFrames(ROUND - 1);
  expect(result.current.settled).toBe(false);

  await passFrames(1);
  expect(result.current.settled).toBe(true);
});

// The host outlives its scene while fonts reload: a round begun for a scene
// that has gone must not raise the marker over an empty surface.
test("a scene that goes away mid-round does not settle", async () => {
  const { result, rerender } = await renderHook(
    ({ mounted }: MountedProps) => {
      return useSceneSettled(mounted);
    },
    { initialProps: { mounted: true } },
  );

  await passFrames(ROUND - 1);
  await rerender({ mounted: false });
  await passFrames(ROUND);

  expect(result.current.settled).toBe(false);
});

test("an unmounted scene starts no further round", async () => {
  const { result, unmount } = await renderHook(() => {
    return useSceneSettled(true);
  });

  await commitOnce(result.current.recordCommit);
  await unmount();
  await passFrames(ROUND);

  // The round in flight ran out; had it gone on, a frame would be waiting.
  expect(frames.pending()).toBe(0);
});

// Through the host, with a scene that is drawn again some frames after it
// mounts — what `CandleChart` does when `onLayout` reports its width.
test("the host keeps the marker pending until a late redraw has gone quiet", async () => {
  await render(
    <VisualScenarioHost skin="classic" mode="dark">
      <Text>first size</Text>
    </VisualScenarioHost>,
  );

  await passFrames(ROUND - 1);
  expect(screen.queryByText("first size")).toBeTruthy();

  await screen.rerender(
    <VisualScenarioHost skin="classic" mode="dark">
      <Text>measured size</Text>
    </VisualScenarioHost>,
  );
  expect(screen.queryByText("measured size")).toBeTruthy();

  // The round that began at mount ends here, having seen the redraw.
  await passFrames(1);
  expect(screen.queryByTestId("visual-ready")).toBeNull();
  expect(screen.queryByTestId("visual-pending")).toBeTruthy();

  await passFrames(ROUND);
  expect(screen.queryByTestId("visual-ready")).toBeTruthy();
});

beforeEach(() => {
  frames = createFrameStepper();
  global.requestAnimationFrame = frames.request;
  global.cancelAnimationFrame = frames.cancel;
});

afterEach(() => {
  global.requestAnimationFrame = realRequest;
  global.cancelAnimationFrame = realCancel;
});

async function commitOnce(recordCommit: () => void): Promise<void> {
  await act(async () => {
    recordCommit();
    await Promise.resolve();
  });
}

/** Runs `count` animation frames, one at a time, each inside `act`. */
async function passFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await act(async () => {
      frames.step();
      await Promise.resolve();
    });
  }
}

interface FrameStepper {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number | null | undefined): void;
  /** Runs the callbacks requested so far; ones they request wait a step. */
  step(): void;
  pending(): number;
}

/** Stands in for the frame clock, so a test decides when each frame happens. */
function createFrameStepper(): FrameStepper {
  const queue = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;

  return {
    request: (callback: FrameRequestCallback): number => {
      const handle = nextHandle;

      nextHandle += 1;
      queue.set(handle, callback);

      return handle;
    },
    cancel: (handle: number | null | undefined): void => {
      if (typeof handle === "number") {
        queue.delete(handle);
      }
    },
    step: (): void => {
      const due = [...queue.values()];

      queue.clear();

      for (const callback of due) {
        callback(0);
      }
    },
    pending: (): number => {
      return queue.size;
    },
  };
}

/** Frames in one round: the UI thread's, then this thread's. Both threads'
 * frames come from the one stepper here, since the mock below runs a worklet
 * where it is scheduled. */
const ROUND: number = UI_FRAMES + JS_FRAMES;

let frames: FrameStepper = createFrameStepper();
interface MountedProps {
  readonly mounted: boolean;
}

const realRequest: typeof requestAnimationFrame = global.requestAnimationFrame;
const realCancel: typeof cancelAnimationFrame = global.cancelAnimationFrame;

jest.mock("#/ui/theme/fonts", () => {
  return {
    useAppFonts: (): boolean => {
      return true;
    },
  };
});

jest.mock("react-native-worklets", () => {
  return {
    scheduleOnUI: (worklet: () => void): void => {
      worklet();
    },
    scheduleOnRN: (callback: () => void): void => {
      callback();
    },
  };
});
