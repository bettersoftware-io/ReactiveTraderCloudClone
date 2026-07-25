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

  it("renders the indeterminate bar below the status content, decorative to assistive tech", () => {
    render(() => {
      return <ReactorWait />;
    });

    const root = screen.getByTestId("auth-wait-reactor");
    const track = root.querySelector('[aria-hidden="true"]');
    expect(track).not.toBeNull();
    expect(track?.querySelector("div")).not.toBeNull();
  });

  it("no longer owns the reactor rings — those wrap the emblem via ReactorRings", () => {
    render(() => {
      return <ReactorWait />;
    });

    const root = screen.getByTestId("auth-wait-reactor");
    expect(root.querySelectorAll("svg").length).toBe(0);
  });
});
