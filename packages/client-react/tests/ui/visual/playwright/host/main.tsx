import { VisualScenario } from "@ui-visual";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Same reset the real app uses, so full-App scenarios lay out at full height.
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue",
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;
document.head.appendChild(style);

const name = new URLSearchParams(window.location.search).get("scenario");
if (!name) throw new Error("Missing ?scenario=<name>");

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in DOM");
createRoot(rootEl).render(
  <StrictMode>
    <VisualScenario name={name} />
  </StrictMode>,
);
