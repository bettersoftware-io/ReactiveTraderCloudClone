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
    // T31: the official mock builds a NEW `{value}` object on every render,
    // where the real hook is `useRef`-backed and stable for a component's
    // lifetime. That difference is not cosmetic — it silently inverts what a
    // test proves. Code memoising on a shared value looks broken under jest
    // while being correct on device, and a harness can propagate a changing
    // prop purely because the mock rebuilt the object, which is how
    // `LaserSceneHarness` came to assert a timeline it would not really have
    // driven (T29's defect, reproduced inside the instrument for it).
    //
    // `require` rather than a module-scope import because jest hoists this
    // factory above the imports; the cast is what lets the generic through.
    useSharedValue: <T>(initial: T): MockSharedValue<T> => {
      const react = require("react") as typeof import("react");
      const ref = react.useRef<MockSharedValue<T> | null>(null);
      ref.current ??= { value: initial };
      return ref.current;
    },
  };
});

/** The `{ value }` box `useSharedValue` hands back — one per component
 * lifetime, as the real hook does. */
interface MockSharedValue<T> {
  value: T;
}

interface HostElementProps {
  children?: unknown;
}

interface MockPaint {
  setColor: () => void;
  setStyle: () => void;
  setStrokeWidth: () => void;
  setAntiAlias: () => void;
  setAlphaf: () => void;
  // Phase 6b-1, Task 1 (CoreScene nucleus glow): the radial-gradient shader
  // setter a paint needs before `drawRect` fills with it.
  setShader: () => void;
  // Phase 6b-1, Task 8 (DockingScene): the dashed acquiring ring.
  setPathEffect: () => void;
}

interface MockTextBounds {
  width: number;
}

interface MockTypeface {
  __mockTypeface: true;
  /** The asset module id the face was loaded from, so a test can tell the
   * regular and bold faces apart — they are otherwise identical stubs. */
  source: unknown;
}

interface MockFont {
  setSize: () => void;
  getTextWidth: () => number;
  measureText: () => MockTextBounds;
  // P1 fix: `useBootSceneFonts` reads the typeface off a loaded font and
  // re-sizes it per draw site.
  getTypeface: () => MockTypeface;
  /** Inputs recorded for assertions. A real `SkFont` exposes neither; jest
   * cannot see rasterized glyphs, so what a font was BUILT from is the only
   * checkable property here. */
  __typeface: unknown;
  __size: number | undefined;
}

interface MockCanvas {
  drawLine: () => void;
  drawCircle: () => void;
  drawPath: () => void;
  drawRect: () => void;
  drawText: () => void;
  clear: () => void;
  // Phase 6b-1, Task 1 (CoreScene backdrop wash): a flat-fill whole-canvas
  // paint call, distinct from `drawRect` in the real API.
  drawPaint: () => void;
  // Phase 6b-1, Task 8 (DockingScene): this scene is the first to use canvas
  // transform state (the shaking corridor, the craft body/reticle's local
  // translate+rotate) and the oval primitive (the corridor's concentric
  // rings).
  save: () => void;
  restore: () => void;
  translate: () => void;
  rotate: () => void;
  scale: () => void;
  drawOval: () => void;
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
      setShader: () => {},
      setPathEffect: () => {},
    };
  }

  function createMockFont(typeface?: unknown, size?: number): MockFont {
    return {
      setSize: () => {},
      getTextWidth: () => {
        return 0;
      },
      measureText: () => {
        return { width: 0 };
      },
      // `useBootSceneFonts` lifts the typeface off a loaded font and re-sizes
      // it per draw site, so the mock must expose one.
      getTypeface: () => {
        return { __mockTypeface: true, source: typeface };
      },
      __typeface: typeface,
      __size: size,
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
      drawPaint: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      drawOval: () => {},
    };
  }

  return {
    Canvas: passthrough("SkiaCanvas"),
    Group: passthrough("SkiaGroup"),
    // Phase 5c Task 3 (PnlChart): the dashed zero baseline, declaratively.
    DashPathEffect: passthrough("SkiaDashPathEffect"),
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
    // Phase 5c Task 5 (ExposureBubbles): the bubble glow's radial shader, and
    // the first DECLARATIVE text node in the app — the boot scenes all draw
    // their text imperatively through `canvas.drawText`.
    RadialGradient: passthrough("SkiaRadialGradient"),
    Text: passthrough("SkiaText"),
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
    // Phase 6b-1, Task 1 (CoreScene nucleus glow): the radial-gradient shader
    // factory and the tile-mode enum it takes.
    TileMode: { Clamp: 0, Repeat: 1, Mirror: 2, Decal: 3 },
    Skia: {
      Paint: createMockPaint,
      Color: (color: string) => {
        return color;
      },
      Shader: {
        MakeRadialGradient: () => {
          return { __mockShader: true };
        },
        // Phase 6b-1, Task 9 (DockingScene): the scan-sweep's linear gradient
        // band.
        MakeLinearGradient: () => {
          return { __mockShader: true };
        },
      },
      // Phase 6b-1, Task 8 (DockingScene): the dashed acquiring ring.
      PathEffect: {
        MakeDash: () => {
          return { __mockPathEffect: true };
        },
      },
      // Phase 6b-1, Task 2 (CoreScene gyro rings): polyline paths built inside
      // the recorder worklet. Phase 5c Task 3 (PnlChart) adds
      // `MakeFromSVGString`, which returns `SkPath | null` on the real API —
      // the mock returns an object, so a caller's null-guard is exercised by
      // its own unit tests rather than here.
      Path: {
        Make: () => {
          return {
            moveTo: () => {},
            lineTo: () => {},
            close: () => {},
            addRect: () => {},
            addCircle: () => {},
          };
        },
        MakeFromSVGString: () => {
          return {
            moveTo: () => {},
            lineTo: () => {},
            close: () => {},
            addRect: () => {},
            addCircle: () => {},
          };
        },
      },
      // P1 fix: scenes now build fonts from a real bundled typeface, in
      // React-land, via `useBootSceneFonts` — never as a bare `Skia.Font()`
      // inside the draw worklet. The factory keeps its arity so the mock
      // matches the real `(typeface?, size?)` signature.
      //
      // Note what this mock still CANNOT catch: a font with no typeface draws
      // zero glyphs on device but "succeeds" here, which is precisely how the
      // missing text shipped. jest proves the draw calls are well-formed and
      // nothing more — the pixels are the device's and the goldens' business.
      Font: (typeface?: unknown, size?: number) => {
        return createMockFont(typeface, size);
      },
    },
    // The asset-backed typeface loader. Returns a ready font immediately so
    // the text branches of every scene run under jest; the real hook resolves
    // asynchronously and yields null first (a window the scenes and the
    // visual harness both handle explicitly).
    useFont: (source: unknown, size?: number) => {
      return createMockFont(source, size);
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
