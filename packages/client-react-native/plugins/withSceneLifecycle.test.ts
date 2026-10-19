import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { adoptSceneLifecycle } from "./withSceneLifecycle.ts";

// The fixture is `ios/HelloWorld/AppDelegate.swift` from
// `expo-template-bare-minimum@57.0.32`, verbatim — the file prebuild hands this
// plugin. An Xcode 27 build of it launches and is killed at once.
describe("adoptSceneLifecycle", () => {
  it("makes the app delegate the scene delegate's factory provider", () => {
    expect(adoptSceneLifecycle(SDK_57_APP_DELEGATE)).toContain(
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    );
  });

  // Starting React Native here as well would build a second, scene-less
  // window — the one iOS 27 refuses to launch with.
  it("stops the app delegate creating a window and starting React Native", () => {
    const adopted = adoptSceneLifecycle(SDK_57_APP_DELEGATE);

    expect(adopted).not.toContain("UIWindow(");
    expect(adopted).not.toContain("startReactNative");
  });

  it("keeps the factory the scene delegate starts React Native from", () => {
    const adopted = adoptSceneLifecycle(SDK_57_APP_DELEGATE);

    expect(adopted).toContain("var reactNativeFactory: RCTReactNativeFactory?");
    expect(adopted).toContain("reactNativeFactory = factory");
  });

  // `ExpoAppSceneDelegate` re-feeds scene URLs and activities to these.
  it("keeps the deep-link and universal-link overrides", () => {
    const adopted = adoptSceneLifecycle(SDK_57_APP_DELEGATE);

    expect(adopted).toContain("open url: URL,");
    expect(adopted).toContain("continue userActivity: NSUserActivity,");
  });

  it("leaves an already-adopted app delegate unchanged", () => {
    const adopted = adoptSceneLifecycle(SDK_57_APP_DELEGATE);

    expect(adoptSceneLifecycle(adopted)).toBe(adopted);
  });

  it("refuses a template it does not recognise rather than half-apply", () => {
    const withoutWindowStart = SDK_57_APP_DELEGATE.replace(
      "window = UIWindow(frame: UIScreen.main.bounds)",
      "window = makeWindow()",
    );

    expect(() => {
      adoptSceneLifecycle(withoutWindowStart);
    }).toThrow(/does not match the SDK 57 template/);
  });
});

const SDK_57_APP_DELEGATE = readFileSync(
  new URL("fixtures/AppDelegate.sdk57.swift", import.meta.url),
  "utf8",
);
