import { describe, it, expect, afterEach } from "vitest";
import { mount, cleanupMounted } from "@ui-contract/mount";
import { Footer } from "@ui-contract/components";
import { ConnectionStatus } from "@rtc/domain";

afterEach(() => cleanupMounted());

describe("Footer", () => {
  it("renders the footer landmark", () => {
    const footer = mount(Footer);
    expect(footer.isRendered()).toBe(true);
  });

  it("surfaces the current connection status", () => {
    const footer = mount(Footer, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(footer.statusText()).toBe("Connected");
  });

  it("reflects a live connection drop in the embedded status bar", () => {
    const footer = mount(Footer, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(footer.statusText()).toBe("Connected");
    footer.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    expect(footer.statusText()).toBe("Disconnected");
  });
});
