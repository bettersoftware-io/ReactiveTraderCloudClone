import "@testing-library/react-native";

// Gesture-handler ships an official jest setup (stubs the native gesture module).
import "react-native-gesture-handler/jestSetup";

// Reanimated ships an official mock (stable across v3/v4). It replaces the
// worklet runtime with synchronous JS so animated components render in jsdom.
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// Skia has no jest-expo mock. Stub the components used across the rehaul as
// pass-through host elements so trees mount; extend this list as later phases
// introduce more Skia primitives.
jest.mock("@shopify/react-native-skia", () => {
  const React = require("react");
  const passthrough =
    (name: string) =>
    (props: { children?: unknown }): unknown =>
      React.createElement(name, props, props.children);
  return {
    Canvas: passthrough("SkiaCanvas"),
    Group: passthrough("SkiaGroup"),
    Circle: passthrough("SkiaCircle"),
    Rect: passthrough("SkiaRect"),
    Fill: passthrough("SkiaFill"),
    Path: passthrough("SkiaPath"),
    Line: passthrough("SkiaLine"),
    Paint: passthrough("SkiaPaint"),
  };
});

jest.mock("expo-blur", () => {
  const React = require("react");
  return {
    BlurView: (props: { children?: unknown }): unknown =>
      React.createElement("BlurView", props, props.children),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

jest.mock("expo-sensors", () => ({
  Gyroscope: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
    isAvailableAsync: jest.fn(async () => false),
  },
}));
