import { describe, expect, it } from "vitest";

import type { AppPorts } from "@rtc/core-api";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { scriptPorts } from "#/harness/scriptedPorts";

describe("scriptPorts port-call counting", () => {
  it("counts each preferences stream method by name, and connectionEvents.events", () => {
    const { ports, driver, teardown } = scriptPorts(createBasePorts());
    expect(driver.portCalls("themeMode$")).toBe(0);
    ports.preferences.themeMode$();
    ports.preferences.themeMode$();
    ports.preferences.viewMode$();
    ports.connectionEvents.events();
    expect(driver.portCalls("themeMode$")).toBe(2);
    expect(driver.portCalls("viewMode$")).toBe(1);
    expect(driver.portCalls("connectionEvents.events")).toBe(1);
    teardown();
  });

  it("forwards the call to the real port with its own `this`", () => {
    const { ports, teardown } = scriptPorts(createBasePorts());
    ports.preferences.setThemeMode("light");
    const seen: string[] = [];
    ports.preferences.themeMode$().subscribe((mode) => {
      seen.push(mode);
    });
    expect(seen).toEqual(["light"]);
    teardown();
  });
});

/** The narrowest `AppPorts` the harness accepts: only the members it reads
 * are real; the rest are typed through a cast the test owns. */
function createBasePorts(): AppPorts {
  return {
    preferences: new PreferencesSimulator(),
    auth: new AuthSimulator({ demo: "pw" }),
    connectionEvents: {
      events: () => {
        return new (class {
          subscribe(): Unsubscribable {
            return { unsubscribe: () => {} };
          }
        })() as never;
      },
    },
  } as unknown as AppPorts;
}

interface Unsubscribable {
  unsubscribe(): void;
}
