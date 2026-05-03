import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./theme/ThemeProvider";
import { ServiceProvider } from "./services/ServiceProvider";
import { ConnectionProvider } from "./connection/ConnectionProvider";
import { App } from "./App";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ServiceProvider>
        <ConnectionProvider>
          <App />
        </ConnectionProvider>
      </ServiceProvider>
    </ThemeProvider>
  </StrictMode>,
);
