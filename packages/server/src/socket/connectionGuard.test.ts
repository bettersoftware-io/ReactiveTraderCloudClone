import { describe, expect, it } from "vitest";

import { createConnectionGuard } from "#/socket/connectionGuard";

describe("connectionGuard", () => {
  it("refuses the (maxPerIp + 1)th socket from one IP while another IP is still welcome", () => {
    const guard = createConnectionGuard({ maxTotal: 10, maxPerIp: 2 });
    guard.acquire("a");
    guard.acquire("a");

    expect(guard.canAccept("a")).toBe("too-many-from-ip");
    expect(guard.canAccept("b")).toBe("ok");
  });

  it("refuses everyone at maxTotal and welcomes again after a release", () => {
    const guard = createConnectionGuard({ maxTotal: 2, maxPerIp: 5 });
    guard.acquire("a");
    guard.acquire("b");

    expect(guard.canAccept("c")).toBe("too-many-connections");
    guard.release("a");
    expect(guard.canAccept("c")).toBe("ok");
    expect(guard.total()).toBe(1);
  });

  it("a release frees one of several slots held by the same IP, not all of them", () => {
    const guard = createConnectionGuard({ maxTotal: 10, maxPerIp: 2 });
    guard.acquire("a");
    guard.acquire("a");
    guard.release("a");

    expect(guard.canAccept("a")).toBe("ok");
    guard.acquire("a");
    expect(guard.canAccept("a")).toBe("too-many-from-ip");
    expect(guard.total()).toBe(2);
  });

  it("a release for an unknown IP is a no-op and never goes negative", () => {
    const guard = createConnectionGuard({ maxTotal: 2, maxPerIp: 5 });
    guard.release("ghost");
    expect(guard.total()).toBe(0);
  });
});
