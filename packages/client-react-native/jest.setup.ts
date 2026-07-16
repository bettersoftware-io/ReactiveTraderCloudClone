import { jest } from "@jest/globals";
import "@testing-library/react-native";
// Gesture-handler ships an official jest setup (stubs the native gesture module).
import "react-native-gesture-handler/jestSetup";

// Reanimated ships an official mock (stable across v3/v4). It replaces the
// worklet runtime with synchronous JS so animated components render in jsdom.
jest.mock("react-native-reanimated", () => {
  return require("react-native-reanimated/mock");
});

interface HostElementProps {
  children?: unknown;
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
