import { describe, expect, it } from "vitest";

import {
  type DataSourceDecision,
  formatDataSourceMessage,
  isDataSource,
  resolveDataSource,
  type ResolveDataSourceInput,
} from "./dataSource";

describe("resolveDataSource", () => {
  it("composes sim when there is no server URL, whatever else is stored", () => {
    expect(
      resolveDataSource(
        createInput({
          serverUrl: undefined,
          stored: "live",
          hasStoredSession: true,
        }),
      ),
    ).toEqual<DataSourceDecision>({
      source: "sim",
      hybrid: false,
      reason: "no-server-url",
    });
    expect(resolveDataSource(createInput({ serverUrl: "" }))).toMatchObject({
      source: "sim",
      reason: "no-server-url",
    });
  });

  it("composes live when a server URL is set but no demo roster exists (today's WS-real mode)", () => {
    expect(
      resolveDataSource(createInput({ hasDemoRoster: false, stored: "sim" })),
    ).toEqual<DataSourceDecision>({
      source: "live",
      hybrid: false,
      reason: "no-demo-roster",
    });
  });

  it("hybrid: a stored choice wins", () => {
    expect(
      resolveDataSource(createInput({ stored: "live" })),
    ).toEqual<DataSourceDecision>({
      source: "live",
      hybrid: true,
      reason: "stored",
    });
    expect(
      resolveDataSource(createInput({ stored: "sim", hasStoredSession: true })),
    ).toMatchObject({ source: "sim", reason: "stored" });
  });

  it("hybrid: a stored session with no choice composes live (a pre-hybrid live session)", () => {
    expect(
      resolveDataSource(createInput({ stored: null, hasStoredSession: true })),
    ).toEqual<DataSourceDecision>({
      source: "live",
      hybrid: true,
      reason: "session-without-choice",
    });
  });

  it("hybrid: nothing stored composes sim", () => {
    expect(resolveDataSource(createInput({}))).toEqual<DataSourceDecision>({
      source: "sim",
      hybrid: true,
      reason: "default",
    });
  });
});

describe("isDataSource", () => {
  it("accepts exactly the two sources", () => {
    expect(isDataSource("sim")).toBe(true);
    expect(isDataSource("live")).toBe(true);
    expect(isDataSource("banana")).toBe(false);
    expect(isDataSource(null)).toBe(false);
    expect(isDataSource(undefined)).toBe(false);
  });
});

describe("formatDataSourceMessage", () => {
  it("names the source, the reason and whether the page is hybrid", () => {
    expect(
      formatDataSourceMessage({ source: "sim", hybrid: true, reason: "default" }),
    ).toBe("[data] composed sim from default (hybrid)");
    expect(
      formatDataSourceMessage({
        source: "live",
        hybrid: false,
        reason: "no-demo-roster",
      }),
    ).toBe("[data] composed live from no-demo-roster");
  });
});

function createInput(
  overrides: Partial<ResolveDataSourceInput>,
): ResolveDataSourceInput {
  return {
    serverUrl: "wss://server.example",
    hasDemoRoster: true,
    stored: null,
    hasStoredSession: false,
    ...overrides,
  };
}
