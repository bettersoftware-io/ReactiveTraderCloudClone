import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPathRouteHistory } from "#/adapters/PathRouteHistory";

describe("createPathRouteHistory (jsdom history)", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/?core=rxjs");
  });

  it("push writes the path as a new entry", () => {
    const routes = createPathRouteHistory(window);
    const before = history.length;

    routes.push({ area: "workspace", tab: "credit" });

    expect(location.pathname).toBe("/credit");
    expect(history.length).toBe(before + 1);
  });

  it("replace rewrites the path without adding an entry", () => {
    const routes = createPathRouteHistory(window);
    const before = history.length;

    routes.replace({ area: "workspace", tab: "credit" });

    expect(location.pathname).toBe("/credit");
    expect(history.length).toBe(before);
  });

  it("push and replace carry the query and the fragment over", () => {
    history.replaceState(null, "", "/?core=rxjs&splash#keep");
    const routes = createPathRouteHistory(window);

    routes.push({ area: "workspace", tab: "credit" });

    expect(location.search).toBe("?core=rxjs&splash");
    expect(location.hash).toBe("#keep");

    routes.replace({ area: "workspace", tab: "fx" });

    expect(location.pathname).toBe("/fx");
    expect(location.search).toBe("?core=rxjs&splash");
    expect(location.hash).toBe("#keep");
  });

  it("push and replace write the path from the root under a <base href> elsewhere", () => {
    const base = document.createElement("base");
    base.href = "/elsewhere/";
    document.head.append(base);

    try {
      const routes = createPathRouteHistory(window);

      routes.push({ area: "workspace", tab: "credit" });

      expect(location.pathname).toBe("/credit");
      expect(location.search).toBe("?core=rxjs");

      routes.replace({ area: "workspace", tab: "fx" });

      expect(location.pathname).toBe("/fx");
    } finally {
      base.remove();
    }
  });

  it("current reads location.pathname, ignoring the fragment", () => {
    const routes = createPathRouteHistory(window);
    expect(routes.current()).toBeNull();

    history.replaceState(null, "", "/#/credit");
    expect(routes.current()).toBeNull();

    history.replaceState(null, "", "/credit");
    expect(routes.current()).toEqual({ area: "workspace", tab: "credit" });
  });

  it("a subscriber hears traversal but not its own push or replace", () => {
    const routes = createPathRouteHistory(window);
    const listener = vi.fn();
    routes.subscribe(listener);

    routes.push({ area: "workspace", tab: "credit" });
    routes.replace({ area: "workspace", tab: "fx" });
    expect(listener).not.toHaveBeenCalled();

    history.replaceState(null, "", "/equities");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      area: "workspace",
      tab: "equities",
    });
  });

  it("unsubscribe stops delivery", () => {
    const routes = createPathRouteHistory(window);
    const listener = vi.fn();
    const unsubscribe = routes.subscribe(listener);

    unsubscribe();
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("push stores nothing in history.state", () => {
    const routes = createPathRouteHistory(window);

    routes.push({ area: "workspace", tab: "credit" });

    expect(history.state).toBeNull();
  });

  it("replace stores nothing in history.state, clearing what the entry held", () => {
    history.replaceState({ held: "before" }, "", "/?core=rxjs");
    const routes = createPathRouteHistory(window);

    routes.replace({ area: "workspace", tab: "credit" });

    expect(history.state).toBeNull();
  });
});
