import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHashRouteHistory } from "#/adapters/HashRouteHistory";

describe("createHashRouteHistory (jsdom history)", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/?core=rxjs");
  });

  it("push writes the hash as a new entry and leaves the path and query", () => {
    const routes = createHashRouteHistory(window);
    const before = history.length;

    routes.push({ area: "workspace", tab: "credit" });

    expect(location.hash).toBe("#/credit");
    expect(history.length).toBe(before + 1);
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("?core=rxjs");
  });

  it("replace rewrites the hash without adding an entry", () => {
    const routes = createHashRouteHistory(window);
    const before = history.length;

    routes.replace({ area: "workspace", tab: "credit" });

    expect(location.hash).toBe("#/credit");
    expect(history.length).toBe(before);
  });

  it("push and replace keep the page's path under a <base href> elsewhere", () => {
    const base = document.createElement("base");
    base.href = "/elsewhere/";
    document.head.append(base);

    try {
      const routes = createHashRouteHistory(window);

      routes.push({ area: "workspace", tab: "credit" });

      expect(location.pathname).toBe("/");
      expect(location.search).toBe("?core=rxjs");
      expect(location.hash).toBe("#/credit");

      routes.replace({ area: "workspace", tab: "fx" });

      expect(location.pathname).toBe("/");
      expect(location.hash).toBe("#/fx");
    } finally {
      base.remove();
    }
  });

  it("current reads location.hash", () => {
    const routes = createHashRouteHistory(window);
    expect(routes.current()).toBeNull();

    history.replaceState(null, "", "/#/credit");

    expect(routes.current()).toEqual({ area: "workspace", tab: "credit" });
  });

  it("a subscriber hears traversal but not its own push or replace", () => {
    const routes = createHashRouteHistory(window);
    const listener = vi.fn();
    routes.subscribe(listener);

    routes.push({ area: "workspace", tab: "credit" });
    routes.replace({ area: "workspace", tab: "fx" });
    expect(listener).not.toHaveBeenCalled();

    history.replaceState(null, "", "/#/equities");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      area: "workspace",
      tab: "equities",
    });
  });

  it("unsubscribe stops delivery", () => {
    const routes = createHashRouteHistory(window);
    const listener = vi.fn();
    const unsubscribe = routes.subscribe(listener);

    unsubscribe();
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("push stores nothing in history.state", () => {
    const routes = createHashRouteHistory(window);

    routes.push({ area: "workspace", tab: "credit" });

    expect(history.state).toBeNull();
  });

  it("replace stores nothing in history.state, clearing what the entry held", () => {
    history.replaceState({ held: "before" }, "", "/?core=rxjs");
    const routes = createHashRouteHistory(window);

    routes.replace({ area: "workspace", tab: "credit" });

    expect(history.state).toBeNull();
  });
});
