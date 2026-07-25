import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { HandshakeConsole } from "./HandshakeConsole";

describe("HandshakeConsole", () => {
  it("renders all three handshake lines legibly at base state", () => {
    render(() => {
      return <HandshakeConsole />;
    });

    const root = screen.getByTestId("auth-wait-handshake");
    expect(root).not.toBeNull();
    expect(root.textContent).toContain("SECURE CHANNEL OPEN");
    expect(root.textContent).toContain("CREDENTIALS SEALED");
    expect(root.textContent).toContain("AWAITING AUTH GRANT");
  });

  it("exposes the wait as a live region for assistive tech", () => {
    render(() => {
      return <HandshakeConsole />;
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("AWAITING AUTH GRANT");
  });
});
