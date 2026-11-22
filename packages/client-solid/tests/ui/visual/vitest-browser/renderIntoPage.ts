import { type JSX, render } from "@solidjs/web";
import { afterEach } from "vitest";
import { type Locator, page } from "vitest/browser";

/** Teardowns of everything `renderIntoPage` mounted in the current test. */
const mounted: (() => void)[] = [];

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount();
  }
});

/**
 * Renders `ui` into a fresh container on the page and returns a locator
 * scoped to that container, unmounted again after the test. This tier's
 * whole need from a rendering library — `vitest-browser-solid`, which it used
 * under Solid 1, has no Solid 2 release, and Solid 2's own `render` already
 * registers the container for delegated events and flushes, so the tree is
 * on the page when this returns.
 *
 * Takes a component FACTORY rather than an element — `renderIntoPage(() =>
 * <X />)` — which is how Solid keeps the component's reactive scope owned by
 * the renderer.
 */
export function renderIntoPage(ui: () => JSX.Element): Locator {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const dispose = render(ui, container);

  mounted.push(() => {
    dispose();
    container.remove();
  });

  return page.elementLocator(container);
}
