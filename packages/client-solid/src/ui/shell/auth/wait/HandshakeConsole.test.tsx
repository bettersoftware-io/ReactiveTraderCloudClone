import { describe, expect, it } from "vitest";

import { handshakeConsolePage } from "#tests/ui/pages/HandshakeConsolePage";

const page = handshakeConsolePage();

describe("HandshakeConsole", () => {
  it("renders all three handshake lines legibly at base state", () => {
    page.mount();

    expect(page.exists("auth-wait-handshake")).toBe(true);
    const text = page.text("auth-wait-handshake");
    expect(text).toContain("SECURE CHANNEL OPEN");
    expect(text).toContain("CREDENTIALS SEALED");
    expect(text).toContain("AWAITING AUTH GRANT");
  });

  it("exposes the wait as a live region for assistive tech", () => {
    page.mount();

    expect(page.statusText()).toContain("AWAITING AUTH GRANT");
  });
});
