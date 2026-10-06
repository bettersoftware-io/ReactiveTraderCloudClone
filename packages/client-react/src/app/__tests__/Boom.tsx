import type { ReactElement } from "react";

/** A tree-mount test fixture: fails its first render, as a UI that cannot
 * render on the new core would. Its own (non-`.test.`) module so it can be a
 * plain exported component (`useComponentExportOnlyModules` +
 * `noExportsInTest`). */
export function Boom(): ReactElement {
  throw new Error("boom");
}
