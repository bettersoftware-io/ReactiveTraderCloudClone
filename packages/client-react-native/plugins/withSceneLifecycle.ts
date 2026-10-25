import fs from "node:fs";
import path from "node:path";

import type { ExpoConfig } from "expo/config";
import {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} from "expo/config-plugins";

// Adopts the UIKit scene life cycle on iOS. An app built with the iOS 27 SDK
// (Xcode 27) that still owns its window from the app delegate is killed at
// launch — SIGTRAP, no crash report, and only "UIScene life cycle is required
// for apps built with this SDK" in the device log.
//
// The runtime half already ships in `expo@57`: `ExpoAppSceneDelegate` creates
// the window from the connecting scene, starts React Native into it, and
// re-feeds URL / user-activity / life-cycle events to the app delegate. What
// SDK 57 lacks is the template wiring: prebuild generates the git-ignored
// `ios/` from `expo-template-bare-minimum@sdk-57`. This plugin applies the
// three edits the SDK 58 template made, so every generated `ios/` comes out
// right. Delete it with the upgrade to SDK 58.
export function withSceneLifecycle(config: ExpoConfig): ExpoConfig {
  return withSceneDelegateSource(
    withAppDelegateHandover(withSceneManifest(config)),
  );
}

/**
 * Hands the window over to the scene delegate: the app delegate keeps creating
 * the React Native factory, and exposes it through
 * `ExpoReactNativeFactoryProvider` instead of starting React Native into a
 * window of its own.
 *
 * Idempotent, because `expo prebuild` without `--clean` re-applies the mods
 * to an existing `ios/`.
 * Throws on a template it does not recognise rather than leave an app that
 * builds green and dies at launch.
 */
export function adoptSceneLifecycle(appDelegate: string): string {
  if (appDelegate.includes(FACTORY_PROVIDER)) {
    return appDelegate;
  }

  if (
    !APP_DELEGATE_CLASS.test(appDelegate) ||
    !WINDOW_START.test(appDelegate)
  ) {
    throw new Error(
      "withSceneLifecycle: AppDelegate.swift does not match the SDK 57 template " +
        "(an `AppDelegate: ExpoAppDelegate` class that starts React Native into " +
        "its own window). If the template now adopts the scene life cycle " +
        "itself, remove this plugin.",
    );
  }

  return appDelegate
    .replace(APP_DELEGATE_CLASS, `$1, ${FACTORY_PROVIDER} {`)
    .replace(
      WINDOW_START,
      "$1// The window is created and React Native is started by `SceneDelegate`\n" +
        "$1// under the scene-based life cycle (required by the iOS 27 SDK).\n",
    );
}

function withSceneManifest(config: ExpoConfig): ExpoConfig {
  return withInfoPlist(config, (plist) => {
    plist.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;

    return plist;
  });
}

function withAppDelegateHandover(config: ExpoConfig): ExpoConfig {
  return withAppDelegate(config, (appDelegate) => {
    if (appDelegate.modResults.language !== "swift") {
      throw new Error(
        `withSceneLifecycle: expected a Swift AppDelegate, got ${appDelegate.modResults.language}`,
      );
    }

    appDelegate.modResults.contents = adoptSceneLifecycle(
      appDelegate.modResults.contents,
    );

    return appDelegate;
  });
}

function withSceneDelegateSource(config: ExpoConfig): ExpoConfig {
  return withXcodeProject(config, (xcode) => {
    const { platformProjectRoot, projectName } = xcode.modRequest;

    if (projectName === undefined) {
      throw new Error(
        "withSceneLifecycle: prebuild did not name the iOS project",
      );
    }

    const filepath = path.join(projectName, SCENE_DELEGATE_FILE);

    fs.writeFileSync(path.join(platformProjectRoot, filepath), SCENE_DELEGATE);

    if (!xcode.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: xcode.modResults,
      });
    }

    return xcode;
  });
}

const FACTORY_PROVIDER = "ExpoReactNativeFactoryProvider";

const APP_DELEGATE_CLASS = /(class AppDelegate: ExpoAppDelegate)\s*\{/;

// The template's `#if os(iOS) || os(tvOS)` block that builds a `UIWindow` from
// the screen bounds and starts React Native into it.
const WINDOW_START =
  /#if os\(iOS\) \|\| os\(tvOS\)\n( *)window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([^)]*\)\n\s*#endif\n/;

const SCENE_DELEGATE_FILE = "SceneDelegate.swift";

const SCENE_DELEGATE = `internal import Expo

// Written by plugins/withSceneLifecycle.ts at prebuild.
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
}
`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};
