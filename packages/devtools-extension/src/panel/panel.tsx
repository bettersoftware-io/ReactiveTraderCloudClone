import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { InspectorApp } from "@rtc/devtools-app";
import "@rtc/devtools-app/InspectorApp.module.css";

import { createPanelSession } from "#/panel/panelSession";
import type { RuntimePort } from "#/ports";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in the RTC panel");
}

const tabId: number = chrome.devtools.inspectedWindow.tabId;

const session = createPanelSession(
  (): RuntimePort =>
    {return chrome.runtime.connect({
      name: `rtc-panel:${tabId}`,
    }) as unknown as RuntimePort},
);

createRoot(rootEl).render(
  <StrictMode>
    <InspectorApp store={session.store} onInvokeIntent={session.invokeIntent} />
  </StrictMode>,
);
