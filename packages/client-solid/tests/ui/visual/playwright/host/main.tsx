import { VisualScenario } from "@ui-visual";
import { render } from "solid-js/web";

// The real app's global stylesheet, in the same last-import position that
// src/main.tsx loads it from — mirroring react's own host
// (client-react/tests/ui/visual/playwright/host/main.tsx). This used to be a
// hand-copied <style> block holding only the reset, which silently made every
// golden a PARTIAL render: index.css also carries `color-scheme` +
// `scrollbar-color` (native scrollbar theming) and the `data-power-saver=freeze`
// catch-all that neutralises decorative motion. Solid asserts against
// react-generated goldens, so the two hosts must load byte-identical global CSS
// or every scenario would diff on page chrome alone.
import "#/index.css";

const name = new URLSearchParams(window.location.search).get("scenario");

if (!name) {
  throw new Error("Missing ?scenario=<name>");
}

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

render(() => {
  return <VisualScenario name={name} />;
}, rootEl);
