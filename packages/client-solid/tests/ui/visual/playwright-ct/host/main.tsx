import { VisualScenario } from "@ui-visual";
import { render } from "solid-js/web";

// DELIBERATELY MINIMAL reset — mirrors react's CT host
// (../../../../../client-react/tests/ui/visual/playwright-ct/host/index.tsx)
// byte-for-byte, NOT ../playwright/host/main.tsx's fuller app-equivalent
// reset. This is the framing decision documented in
// ../playwright-ct.config.ts's header: several scenarios' captured pixel
// DIMENSIONS depend on which reset is present (box-sizing: border-box vs the
// browser default content-box), and this fallback must reproduce react's CT
// tier's environment, not its own Tier-2-equivalent one, to match the CT
// golden set. Do not "fix" this to the fuller reset — that would silently
// target the WRONG golden tree's dimensions.
const style = document.createElement("style");
style.textContent = "html,body{margin:0;padding:0;}";
document.head.appendChild(style);

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
