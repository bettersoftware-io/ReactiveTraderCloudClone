import { expect, test } from "vitest";

import { parseBuildStamp } from "./buildStamp";

test("a commit and a UTC minute make a stamp", () => {
  expect(parseBuildStamp("f0482c5", "2026-10-04T15:20Z")).toEqual({
    commit: "f0482c5",
    builtAt: "2026-10-04T15:20Z",
  });
});

test("a development run, with nothing set, has no stamp", () => {
  expect(parseBuildStamp(undefined, undefined)).toBeNull();
});

// Half a stamp printed on the sign-in screen would read as a fact.
test("one half alone is no stamp", () => {
  expect(parseBuildStamp("f0482c5", undefined)).toBeNull();
  expect(parseBuildStamp(undefined, "2026-10-04T15:20Z")).toBeNull();
});

// An unexpanded `$(git rev-parse …)` or an empty value must not be shown.
test("a malformed commit or time is no stamp", () => {
  expect(parseBuildStamp("", "2026-10-04T15:20Z")).toBeNull();
  expect(parseBuildStamp("$(git rev-parse)", "2026-10-04T15:20Z")).toBeNull();
  expect(parseBuildStamp("f0482c5", "today")).toBeNull();
  expect(parseBuildStamp("f0482c5", "2026-10-04T15:20:31+01:00")).toBeNull();
});
