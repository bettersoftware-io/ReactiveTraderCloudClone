import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "#/index.css";
import { InspectorApp } from "#/InspectorApp";
import { createInspectorSession } from "#/inspectorSession";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

// One session for the module's lifetime — the panel never remounts the
// underlying BroadcastChannel/InspectorClient, only the view over its store.
const { store } = createInspectorSession();

createRoot(rootEl).render(
  <StrictMode>
    <InspectorApp store={store} />
  </StrictMode>,
);
