import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ServiceHealth } from "#/admin/Services/ServiceHealth";
import type { Service } from "#/admin/types";

afterEach(cleanup);

const SERVICES: Service[] = [
  {
    name: "PRICING ENGINE",
    status: "ONLINE",
    up: "99.99%",
    lat: "8ms",
    barPct: 13.3,
  },
  {
    name: "REFERENCE DATA",
    status: "DEGRADED",
    up: "99.40%",
    lat: "48ms",
    barPct: 80,
  },
];

describe("ServiceHealth", () => {
  test("renders the heading and a row per service with status data attribute", () => {
    const { getByText, container } = render(
      <ServiceHealth services={SERVICES} />,
    );
    expect(getByText("SERVICE HEALTH")).toBeTruthy();
    expect(getByText("REFERENCE DATA")).toBeTruthy();
    expect(container.querySelector('[data-status="DEGRADED"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-status]")).toHaveLength(2);
  });
});
