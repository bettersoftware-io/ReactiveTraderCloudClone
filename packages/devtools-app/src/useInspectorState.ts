import { useSyncExternalStore } from "react";

import type { InspectorState, InspectorStore } from "@rtc/devtools-core";

/** Subscribes the panel shell to the inspector store — a thin
 * `useSyncExternalStore` wrapper so every re-render reads the store's current
 * (copy-on-write) snapshot rather than a stale closure. */
export function useInspectorState(store: InspectorStore): InspectorState {
  return useSyncExternalStore(
    (onChange) => {
      return store.subscribe(onChange);
    },
    () => {
      return store.getSnapshot();
    },
  );
}
