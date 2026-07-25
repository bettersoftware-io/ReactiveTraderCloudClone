import { VisualScenario } from "@ui-visual";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// The real app's global stylesheet, in the same last-import position that
// src/main.tsx loads it from. This used to be a hand-copied <style> block
// holding only the reset, which silently made every golden a PARTIAL render:
// index.css also carries `color-scheme` + `scrollbar-color` (native scrollbar
// theming) and the `data-power-saver=freeze` catch-all that neutralises
// decorative motion. None of those applied here, so freeze scenarios pinned an
// un-frozen render and dark-mode full-page captures pinned a white canvas.
// Importing the real file keeps harness and app on one source of truth, so a
// global rule can never again be invisible to the visual tier.
import "#/index.css";

const name = new URLSearchParams(window.location.search).get("scenario");

if (!name) {
  throw new Error("Missing ?scenario=<name>");
}

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

createRoot(rootEl).render(
  <StrictMode>
    <VisualScenario name={name} />
  </StrictMode>,
);
