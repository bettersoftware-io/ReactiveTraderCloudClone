import { expect, jest, test } from "@jest/globals";

import type { Segment } from "#/ui/SegmentedControl";
import { segmentedControlPage } from "#tests/pages/SegmentedControlPage";

const page = segmentedControlPage();

const SEGMENTS: readonly Segment<Key>[] = [
  { key: "a", label: "ALPHA" },
  { key: "b", label: "BRAVO" },
];

test("names the frame and each segment from the id prefix", async () => {
  await page.mount(SEGMENTS, "a", (): void => {}, "demo");
  expect(page.exists("demo-nav")).toBeTruthy();
  expect(page.hasTextContent("demo-tab-a", "ALPHA")).toBe(true);
  expect(page.hasTextContent("demo-tab-b", "BRAVO")).toBe(true);
});

test("marks only the current segment selected", async () => {
  await page.mount(SEGMENTS, "b", (): void => {}, "demo");
  expect(page.selected("demo-tab-a")).toBe(false);
  expect(page.selected("demo-tab-b")).toBe(true);
});

test("reports the pressed segment's key", async () => {
  const onChange = jest.fn<(key: Key) => void>();
  await page.mount(SEGMENTS, "a", onChange, "demo");
  await page.press("demo-tab-b");
  expect(onChange).toHaveBeenCalledWith("b");
});

type Key = "a" | "b";
