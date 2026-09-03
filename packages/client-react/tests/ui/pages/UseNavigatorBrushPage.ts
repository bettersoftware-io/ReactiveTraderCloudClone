// The framework surface for `useNavigatorBrush.test.ts`: the spec builds its
// own pointer-event fixtures directly, so this page owns only the render/
// act/cleanup mechanics (the sanctioned "spec-side harness composition"
// placement — see task-2-brief.md's worked example).
export { act, cleanup, renderHook } from "@testing-library/react";
