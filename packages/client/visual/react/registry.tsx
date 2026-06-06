import type { ReactElement } from "react";
import { ConnectionStatusBar } from "../../src/ui/shell/connection/ConnectionStatusBar";

// Maps a neutral componentKey to a concrete React element. The SolidJS port
// supplies its own registry with the same keys.
export const registry: Record<string, () => ReactElement> = {
  ConnectionStatusBar: () => <ConnectionStatusBar />,
};
