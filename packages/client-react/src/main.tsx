import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createApp, createMachineFactories } from "./app/composition";
import { App } from "./ui/App";
import { createAppHooks } from "./ui/hooks/createAppHooks";
import { HooksProvider } from "./ui/hooks/HooksProvider";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";

import "./index.css";

const { presenters } = createApp();
const hooks = createAppHooks(presenters, createMachineFactories(presenters));

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in DOM");
createRoot(rootEl).render(
  <StrictMode>
    <HooksProvider hooks={hooks}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </HooksProvider>
  </StrictMode>,
);
