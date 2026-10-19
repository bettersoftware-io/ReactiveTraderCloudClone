import { describe, expect, it } from "vitest";

import {
  chooseNativeProjectAction,
  describeNativeProjectAction,
} from "./nativeProjectFreshness.ts";

describe("chooseNativeProjectAction", () => {
  it("reuses a folder stamped with the current fingerprint", () => {
    expect(
      chooseNativeProjectAction({
        exists: true,
        stamp: CURRENT,
        current: CURRENT,
      }),
    ).toBe("reuse");
  });

  // A config plugin added since, an SDK upgrade, a native dependency bump.
  it("regenerates a folder stamped with another fingerprint", () => {
    expect(
      chooseNativeProjectAction({
        exists: true,
        stamp: OLDER,
        current: CURRENT,
      }),
    ).toBe("regenerate");
  });

  // Every `ios/` generated before this check existed — including the one that
  // built green and was killed at launch under Xcode 27 on 2026-10-19.
  it("regenerates a folder that carries no stamp", () => {
    expect(
      chooseNativeProjectAction({
        exists: true,
        stamp: null,
        current: CURRENT,
      }),
    ).toBe("regenerate");
  });

  it("generates a missing folder", () => {
    expect(
      chooseNativeProjectAction({
        exists: false,
        stamp: null,
        current: CURRENT,
      }),
    ).toBe("generate");
  });
});

describe("describeNativeProjectAction", () => {
  it("is silent when the folder is reused", () => {
    expect(describeNativeProjectAction("reuse", "ios")).toBeNull();
  });

  it("says why a folder is regenerated", () => {
    expect(describeNativeProjectAction("regenerate", "ios")).toContain(
      "Regenerating ios/: its native inputs",
    );
  });
});

const CURRENT = "fddbc62b7b0d326a1256a027b7a2ffd3ca79f7e2";
const OLDER = "15839f16d22b3d2ea4165dd91566322813b1142c";
