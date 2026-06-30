import type { ReactElement } from "react";
import { useState } from "react";

import { AppShell } from "#/shell/AppShell";
import { BootSequence } from "#/shell/Boot/BootSequence";
import { ThemeControls } from "#/shell/ThemeControls";
import { ThemeProvider } from "#/theme/ThemeProvider";

export function App(): ReactElement {
  const [booted, setBooted] = useState(false);
  return (
    <ThemeProvider>
      {booted ? (
        <AppShell>
          <div data-testid="app-root">
            <ThemeControls />
          </div>
        </AppShell>
      ) : (
        <BootSequence
          onDone={() => {
            setBooted(true);
          }}
        />
      )}
    </ThemeProvider>
  );
}
