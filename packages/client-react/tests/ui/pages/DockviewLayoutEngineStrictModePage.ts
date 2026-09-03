// The framework surface for `DockviewLayoutEngine.strictMode.test.tsx`: the
// spec drives its own registry/store fixtures and asserts against the
// serialized blob it collects, not against the DOM, so this page owns only
// the render/cleanup/waitFor mechanics (the sanctioned "spec-side harness
// composition" placement — see task-2-brief.md's worked example).
export { cleanup, render, waitFor } from "@testing-library/react";
