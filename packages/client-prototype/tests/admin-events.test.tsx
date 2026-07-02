import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { LiveEvents } from "#/admin/Events/LiveEvents";
import type { AdminEvent } from "#/admin/types";

afterEach(cleanup);

const EVENTS: AdminEvent[] = [
  {
    id: 1,
    t: "09:46:12",
    sev: "INFO",
    svc: "analytics",
    msg: "Snapshot recomputed",
  },
  {
    id: 2,
    t: "09:44:03",
    sev: "ERROR",
    svc: "refdata",
    msg: "Upstream timeout",
  },
];

describe("LiveEvents", () => {
  test("renders the count and a row per event with severity data attribute", () => {
    const { getByText, container } = render(<LiveEvents events={EVENTS} />);
    expect(getByText("2 events")).toBeTruthy();
    expect(getByText("Upstream timeout")).toBeTruthy();
    expect(container.querySelector('[data-sev="ERROR"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-sev]")).toHaveLength(2);
  });
});
