// The framework surface for `useChartGestures.test.ts`: the spec builds its
// own event fixtures and a bespoke JSX harness component (ChartGesturesHarness)
// for the two wheel-effect tests, so this page owns only the render/act/
// cleanup mechanics (the sanctioned "spec-side harness composition"
// placement — see task-2-brief.md's worked example).
export { act, cleanup, render, renderHook } from "@testing-library/react";
