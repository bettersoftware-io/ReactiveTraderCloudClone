import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { InspectorApp } from "#/InspectorApp";
import "#/index.css";
import { createInspectorSession } from "#/inspectorSession";
import { createRelayInspectorSession } from "#/relaySession";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

// Point at the standalone relay (React Native inspection) via `?relay=<ws-url>`;
// otherwise use the same-origin BroadcastChannel (web app inspection).
const relayUrl = new URLSearchParams(window.location.search).get("relay");

// One session for the module's lifetime — the panel never remounts the
// underlying transport/InspectorClient, only the view over its store.
const { store, invokeIntent } = relayUrl
  ? createRelayInspectorSession(relayUrl)
  : createInspectorSession();

createRoot(rootEl).render(
  <StrictMode>
    <InspectorApp store={store} onInvokeIntent={invokeIntent} />
  </StrictMode>,
);
