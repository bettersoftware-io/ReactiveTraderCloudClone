import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";
import { App } from "./ui/App";
import { createApp, createMachineFactories } from "./app/composition";
import { createAppHooks } from "./ui/hooks/createAppHooks";
import { HooksProvider } from "./ui/hooks/HooksProvider";

const { presenters } = createApp();
const hooks = createAppHooks(presenters, createMachineFactories(presenters));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HooksProvider hooks={hooks}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </HooksProvider>
  </StrictMode>,
);
