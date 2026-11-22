import { expect, test } from "@jest/globals";
import { render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SCENARIOS } from "../scenarios";

/**
 * The RN "visual reach" instrument — the counterpart of the web clients'
 * `ui (visual reach)` coverage tiers.
 *
 * Mounts every registered scenario under jest, exactly as the capture driver
 * would on the simulator, so that istanbul can watch which `src/ui` files a
 * golden ever renders. Run through `pnpm --filter @rtc/client-react-native
 * test:rn:visual:reach`, which adds the coverage flags and then prints
 * `report.ts`'s per-file list; the number that matters is not the total but
 * the files at 0% — each is a surface no golden witnesses, so a change to it
 * has no "before" to diff against. The prototype-fidelity round's step 0 is
 * that its target is not on that list (see `docs/STATUS.md`).
 *
 * As a plain test it is also a mount smoke: every scenario must produce a
 * tree, which catches a fixture that silently renders nothing (a golden of a
 * blank frame passes forever).
 *
 * `GestureHandlerRootView` and `SafeAreaProvider` stand in for the app root
 * the capture route renders under (`app/_layout.tsx` owns the gesture root;
 * `ShellHeader`/`RadialCommandDock` read `useSafeAreaInsets`). Without the
 * gesture root, `lock/hold`'s `HoldToUnlockRing` throws: a `GestureDetector`
 * must sit under one. The safe-area metrics are the iPhone 17's, matching the
 * golden device, though nothing here measures layout.
 *
 * Until Expo 58.0.26 (2026-11-22) this smoke was weaker than it reads: the
 * host renders its scene only once the fonts load (`fontsReady ? children :
 * null`), and under jest they never did, so every test mounted the empty
 * surface alone. They load now, and the scenes really mount.
 */
const IPHONE_17_METRICS = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

for (const scenario of SCENARIOS) {
  test(`mounts ${scenario.id}`, async () => {
    const result = await render(
      <GestureHandlerRootView>
        <SafeAreaProvider initialMetrics={IPHONE_17_METRICS}>
          {scenario.build()}
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
    expect(result.toJSON()).not.toBeNull();
    await result.unmount();
  });
}
