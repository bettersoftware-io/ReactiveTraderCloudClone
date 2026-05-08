import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";
import { App } from "./App";
import { createApp } from "./app/composition";
import { createAppHooks } from "./ui/hooks/createAppHooks";
import { HooksProvider } from "./ui/hooks/HooksProvider";

// Global reset
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
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

const { presenters } = createApp();
const hooks = createAppHooks(presenters);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <HooksProvider hooks={hooks}>
        <App />
      </HooksProvider>
    </ThemeProvider>
  </StrictMode>,
);
