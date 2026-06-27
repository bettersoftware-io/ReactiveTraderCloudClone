import { StatusBar } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

afterEach(() => {
  return cleanupMounted();
});

describe("StatusBar", () => {
  it("renders the status-bar landmark with the cosmetic readouts", () => {
    const bar = mount(StatusBar);
    expect(bar.isRendered()).toBe(true);
    expect(bar.hasCosmeticMetrics()).toBe(true);
    expect(bar.buildText()).toMatch(/BUILD v4\.0\.1/);
  });

  it("surfaces the current connection status via the embedded ConnectionStatusBar", () => {
    const bar = mount(StatusBar, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(bar.connectionText()).toBe("Connected");
  });

  it("reflects a live connection drop in the embedded status bar", () => {
    const bar = mount(StatusBar, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(bar.connectionText()).toBe("Connected");
    bar.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    expect(bar.connectionText()).toBe("Disconnected");
  });

  it("shows the operator id from the session seam", () => {
    const bar = mount(StatusBar);
    expect(bar.operator()).toBe("TRD-0042");
  });
});
