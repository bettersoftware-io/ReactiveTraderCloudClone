import {
  type AppToInspector,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
} from "@rtc/devtools-core";

import { ChromeRuntimeDuplex } from "#/ChromeRuntimeDuplex";
import type { ConnectFn } from "#/ports";

export interface PanelSession {
  store: InspectorStore;
  invokeIntent(machineId: string, name: string, args: readonly unknown[]): void;
  dispose(): void;
}

/** The ChromeRuntimeDuplex analogue of @rtc/devtools-app's createInspectorSession:
 * an InspectorStore + an InspectorClient piping the panel's runtime-port transport
 * into it. `connect` is injected so the panel supplies chrome.runtime.connect while
 * tests supply a fake. Exposes invokeIntent for parity with the same-origin
 * inspector — the affordance stays dev-gated (welcome.dev) + confirm-gated in the panel. */
export function createPanelSession(connect: ConnectFn): PanelSession {
  const store = new InspectorStore();
  const duplex = new ChromeRuntimeDuplex<InspectorToApp, AppToInspector>(
    connect,
  );
  const client = new InspectorClient(duplex, store);
  client.start();

  return {
    store,
    invokeIntent: (
      machineId: string,
      name: string,
      args: readonly unknown[],
    ): void => {
      client.invokeIntent(machineId, name, args);
    },
    dispose: (): void => {
      client.dispose();
      duplex.dispose();
    },
  };
}
