import { jest } from "@jest/globals";
import "@testing-library/react-native";
// Gesture-handler ships an official jest setup (stubs the native gesture module).
import "react-native-gesture-handler/jestSetup";

// Reanimated ships an official mock (stable across v3/v4). It replaces the
// worklet runtime with synchronous JS so animated components render in jsdom.
// The official mock deliberately omits `useReducedMotion` ("ADD ME IF
// NEEDED" in its source) — Task 6's `useAmbientEnabled` calls it, so it's
// added here, pinned to `false` (no test exercises reduced-motion directly;
// that's an on-device concern per the perf doctrine). It likewise omits
// `useFrameCallback` (Task 5's `BootCanvas` — real UI-side timers driving
// `elapsedSec`); the stub below returns the same `{setActive, isActive,
// callbackId}` shape without ever invoking the callback — no fake frame
// loop runs in jsdom, and no test asserts on a ticked value.
jest.mock("react-native-reanimated", () => {
  const officialMock = require("react-native-reanimated/mock");
  return {
    ...officialMock,
    useReducedMotion: () => {
      return false;
    },
    useFrameCallback: (
      _callback: (frameInfo: unknown) => void,
      autostart = true,
    ) => {
      return { setActive: () => {}, isActive: autostart, callbackId: -1 };
    },
  };
});

interface HostElementProps {
  children?: unknown;
}

interface MockPaint {
  setColor: () => void;
  setStyle: () => void;
  setStrokeWidth: () => void;
  setAntiAlias: () => void;
  setAlphaf: () => void;
}

interface MockCanvas {
  drawLine: () => void;
  drawCircle: () => void;
  drawPath: () => void;
  drawRect: () => void;
  drawText: () => void;
  clear: () => void;
}

// Skia has no jest-expo mock. Stub the components used across the rehaul as
// pass-through host elements so trees mount; extend this list as later phases
// introduce more Skia primitives.
jest.mock("@shopify/react-native-skia", () => {
  const React = require("react");

  function passthrough(name: string) {
    return function renderHostElement(props: HostElementProps): unknown {
      return React.createElement(name, props, props.children);
    };
  }

  // Phase 6a boot scenes (starting with CoreScene, Task 6): the imperative
  // `createPicture`/`Skia.*` API, used to build an `SkPicture` on the UI
  // thread instead of declarative Skia components. The mock canvas/paint/font
  // are no-op stand-ins (no real rasterization in jest — Skia is fully
  // mocked, so pixels can never be asserted here), but `createPicture` DOES
  // invoke the real drawing callback against them, so a scene's draw logic
  // still runs on every render and a thrown/undefined-method bug in it still
  // fails the test, same as the declarative primitives above.
  function createMockPaint(): MockPaint {
    return {
      setColor: () => {},
      setStyle: () => {},
      setStrokeWidth: () => {},
      setAntiAlias: () => {},
      setAlphaf: () => {},
    };
  }

  function createMockCanvas(): MockCanvas {
    return {
      drawLine: () => {},
      drawCircle: () => {},
      drawPath: () => {},
      drawRect: () => {},
      drawText: () => {},
      clear: () => {},
    };
  }

  return {
    Canvas: passthrough("SkiaCanvas"),
    Group: passthrough("SkiaGroup"),
    Circle: passthrough("SkiaCircle"),
    Rect: passthrough("SkiaRect"),
    Fill: passthrough("SkiaFill"),
    Path: passthrough("SkiaPath"),
    Line: passthrough("SkiaLine"),
    Paint: passthrough("SkiaPaint"),
    // Task 6 (AmbientBackground): a blur filter node (child of a shape) and
    // the `vec(x, y)` point-constructor helper Line's p1/p2 need.
    Blur: passthrough("SkiaBlur"),
    // Task 12 (AmbientBackground aurora curtains): a gradient shader node
    // (child of a Rect), filling the curtain bands.
    LinearGradient: passthrough("SkiaLinearGradient"),
    vec: (x: number, y: number) => {
      return { x, y };
    },
    // Phase 6a, Task 6 (CoreScene): the `<Picture>` host + its imperative
    // recorder pair (see comment above).
    Picture: passthrough("SkiaPicture"),
    createPicture: (cb: (canvas: MockCanvas) => void) => {
      cb(createMockCanvas());
      return { __mockPicture: true };
    },
    PaintStyle: { Fill: 0, Stroke: 1 },
    Skia: {
      Paint: createMockPaint,
      Color: (color: string) => {
        return color;
      },
      Font: () => {
        return {
          getTextWidth: () => {
            return 0;
          },
          measureText: () => {
            return { width: 0 };
          },
        };
      },
    },
  };
});

jest.mock("expo-blur", () => {
  const React = require("react");

  function renderBlurView(props: HostElementProps): unknown {
    return React.createElement("BlurView", props, props.children);
  }

  return { BlurView: renderBlurView };
});

jest.mock("expo-haptics", () => {
  return {
    impactAsync: jest.fn(async () => {
      return undefined;
    }),
    notificationAsync: jest.fn(async () => {
      return undefined;
    }),
    selectionAsync: jest.fn(async () => {
      return undefined;
    }),
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
    NotificationFeedbackType: {
      Success: "success",
      Warning: "warning",
      Error: "error",
    },
  };
});

jest.mock("expo-sensors", () => {
  return {
    Gyroscope: {
      addListener: jest.fn(() => {
        return { remove: jest.fn() };
      }),
      setUpdateInterval: jest.fn(),
      isAvailableAsync: jest.fn(async () => {
        return false;
      }),
    },
  };
});
