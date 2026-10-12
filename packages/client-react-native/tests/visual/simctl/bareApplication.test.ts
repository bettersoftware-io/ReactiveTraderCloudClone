import { expect, test } from "vitest";

import {
  describeBareApplication,
  isBareApplicationTree,
} from "./bareApplication";

test("one Application node with nothing under it is the post-Maestro tree", () => {
  expect(isBareApplicationTree([{ role: "AXApplication" }])).toBe(true);
});

// What a healthy simulator returns at the harness home: the app, the marker
// and the dev-menu gear.
test("an app whose elements are listed is not", () => {
  expect(
    isBareApplicationTree([
      { role: "AXApplication" },
      { role: "AXGroup" },
      { role: "AXButton" },
    ]),
  ).toBe(false);
});

// `idb` failing outright, or the app not running, is another diagnosis.
test("an empty tree is not", () => {
  expect(isBareApplicationTree([])).toBe(false);
});

test("a lone element that is not the application is not", () => {
  expect(isBareApplicationTree([{ role: "AXButton" }])).toBe(false);
});

test("the remedy names the simulator to reboot", () => {
  const message = describeBareApplication("ABCD-1234");

  expect(message).toContain("xcrun simctl shutdown ABCD-1234");
  expect(message).toContain("xcrun simctl boot ABCD-1234");
});
