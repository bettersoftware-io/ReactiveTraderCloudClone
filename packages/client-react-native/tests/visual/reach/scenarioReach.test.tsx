import { expect, test } from "@jest/globals";
import { render } from "@testing-library/react-native";
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
 * `SafeAreaProvider` stands in for the app root the framed fixtures assume
 * (`ShellHeader`/`RadialCommandDock` read `useSafeAreaInsets`); the metrics
 * are the iPhone 17's, matching the golden device, though nothing here
 * measures layout.
 */
const IPHONE_17_METRICS = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

for (const scenario of SCENARIOS) {
  test(`mounts ${scenario.id}`, async () => {
    const result = await render(
      <SafeAreaProvider initialMetrics={IPHONE_17_METRICS}>
        {scenario.build()}
      </SafeAreaProvider>,
    );
    expect(result.toJSON()).not.toBeNull();
    await result.unmount();
  });
}
