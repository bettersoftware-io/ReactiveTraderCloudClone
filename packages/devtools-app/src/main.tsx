import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { InspectorApp } from "#/InspectorApp";
import "#/index.css";
import { createInspectorSession } from "#/inspectorSession";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

// One session for the module's lifetime — the panel never remounts the
// underlying BroadcastChannel/InspectorClient, only the view over its store.
const { store, invokeIntent } = createInspectorSession();

createRoot(rootEl).render(
  <StrictMode>
    <InspectorApp store={store} onInvokeIntent={invokeIntent} />
  </StrictMode>,
);
