import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

// Phase 9: the StaleIndicator "Reconnecting…" overlay arm. The stale flag is now
// injected per-symbol through the seam (data.stale[EURUSD] = true), so this
// formerly timer-driven overlay is a deterministic static snapshot.
test("tile/stale", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/stale" />);
  await expect(c).toHaveScreenshot("stale.png", { animations: "disabled" });
});
