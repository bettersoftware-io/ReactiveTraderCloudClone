import { describe, expect, it } from "vitest";

import { LocalStoragePreferencesAdapter } from "#/app/adapters/LocalStoragePreferencesAdapter";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";

// No VITE_SERVER_URL configured in vitest → simulator branch is always taken.
describe("buildBrowserPorts (simulator branch)", () => {
  it("returns a LocalStoragePreferencesAdapter as preferences", () => {
    const ports = buildBrowserPorts();
    expect(ports.preferences).toBeInstanceOf(LocalStoragePreferencesAdapter);
  });

  it("returns a connectionEvents port with an events() function", () => {
    const ports = buildBrowserPorts();
    expect(typeof ports.connectionEvents.events).toBe("function");
  });
});
