import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { ReactorWait } from "./ReactorWait";

describe("ReactorWait", () => {
  it("renders the status line legibly at base state", () => {
    render(() => {
      return <ReactorWait />;
    });

    const root = screen.getByTestId("auth-wait-reactor");
    expect(root).not.toBeNull();
    expect(root.textContent).toContain("AWAITING AUTH GRANT");
  });

  it("exposes the wait as a live region for assistive tech", () => {
    render(() => {
      return <ReactorWait />;
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("AWAITING AUTH GRANT");
  });

  it("the spinning rings are decorative and hidden from assistive tech", () => {
    render(() => {
      return <ReactorWait />;
    });

    const rings = screen
      .getByTestId("auth-wait-reactor")
      .querySelectorAll("svg[aria-hidden='true']");
    expect(rings.length).toBe(2);
  });
});
