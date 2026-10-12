import type { JSX } from "solid-js";

/** A tree-mount test fixture: fails its first render, as a UI that cannot
 * render on the new core would. Its own (non-`.test.`) module so it can be a
 * plain exported component (`useComponentExportOnlyModules` +
 * `noExportsInTest`). */
export function Boom(): JSX.Element {
  throw new Error("boom");
}
