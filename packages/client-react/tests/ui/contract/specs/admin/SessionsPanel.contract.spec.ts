/**
 * SessionsPanel contract spec (Phase 5 Task 8).
 *
 * Verifies that the SessionsPanel renders one row per active session,
 * updates the count badge, and shows "NO ACTIVE SESSIONS" when empty.
 */

import { SessionsPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

const SESSIONS = [
  { id: "s1", user: "trader-1", region: "EU", lat: 51.5, lon: -0.1 },
  { id: "s2", user: "trader-2", region: "US", lat: 40.7, lon: -74.0 },
  { id: "s3", user: "trader-3", region: "APAC", lat: 35.7, lon: 139.7 },
];

describe("SessionsPanel", () => {
  it("renders the sessions panel element", () => {
    const panel = mount(SessionsPanel, {});
    expect(panel.isPresent()).toBe(true);
  });

  it("shows 'NO ACTIVE SESSIONS' when no sessions are seeded", () => {
    const panel = mount(SessionsPanel, {});
    expect(panel.isEmpty()).toBe(true);
    expect(panel.rowCount()).toBe(0);
  });

  it("renders one row per seeded session", () => {
    const panel = mount(SessionsPanel, {
      admin: { sessions: SESSIONS },
    });

    expect(panel.rowCount()).toBe(3);
    expect(panel.isEmpty()).toBe(false);
  });

  it("count badge reflects the number of active sessions", () => {
    const panel = mount(SessionsPanel, {
      admin: { sessions: SESSIONS },
    });

    expect(panel.countBadge()).toBe(3);
  });

  it("count badge is 0 when no sessions are seeded", () => {
    const panel = mount(SessionsPanel, {});
    expect(panel.countBadge()).toBe(0);
  });

  it("re-renders when sessions are updated", () => {
    const panel = mount(SessionsPanel, {});

    expect(panel.isEmpty()).toBe(true);

    panel.setSessions(SESSIONS.slice(0, 2));

    expect(panel.rowCount()).toBe(2);
    expect(panel.countBadge()).toBe(2);
  });
});
