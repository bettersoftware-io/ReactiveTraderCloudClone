import { describe, expect, it } from "vitest";

import {
  isJsonContentType,
  parseAllowedOrigins,
  resolveOriginPolicy,
} from "#/http/originPolicy";

describe("parseAllowedOrigins", () => {
  it("splits on commas, trims, lowercases and keeps scheme://host[:port]", () => {
    expect(
      parseAllowedOrigins(
        " https://RTC-clone-react.vercel.app , https://rtc-clone-solid.vercel.app:443/ ",
      ),
    ).toEqual([
      "https://rtc-clone-react.vercel.app",
      "https://rtc-clone-solid.vercel.app",
    ]);
  });

  it.each([
    ["https://a.example/path", "a path"],
    ["https://a.example?x=1", "a query"],
    ["ftp://a.example", "a scheme that is not http(s)"],
    ["a.example", "no scheme"],
    ["https://", "no host"],
    ["", "an empty entry"],
  ])(
    "refuses %s (%s), naming the entry's position and not its text",
    (entry) => {
      expect(() => {
        return parseAllowedOrigins(`https://ok.example,${entry}`);
      }).toThrow(/RTC_ALLOWED_ORIGINS entry 2/);

      if (entry !== "") {
        expect(() => {
          return parseAllowedOrigins(`https://ok.example,${entry}`);
        }).not.toThrow(
          new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
      }
    },
  );
});

describe("resolveOriginPolicy", () => {
  it("is the list when the setting is given, compared lowercase", () => {
    const policy = resolveOriginPolicy({
      RTC_ALLOWED_ORIGINS: "https://rtc-clone-react.vercel.app",
    });

    expect(policy.kind).toBe("list");
    expect(policy.allows("https://RTC-Clone-React.vercel.app")).toBe(true);
    expect(
      policy.allows("https://rtc-clone-react.vercel.app.evil.example"),
    ).toBe(false);
    expect(policy.allows("http://rtc-clone-react.vercel.app")).toBe(false);
    expect(policy.allows("null")).toBe(false);
  });

  it("is the localhost policy on a machine that is not deployed and has no setting", () => {
    const policy = resolveOriginPolicy({});

    expect(policy.kind).toBe("localhost");
    expect(policy.allows("http://localhost:5173")).toBe(true);
    expect(policy.allows("http://127.0.0.1:5473")).toBe(true);
    expect(policy.allows("http://localhost")).toBe(true);
    expect(policy.allows("https://localhost:5173")).toBe(false);
    expect(policy.allows("http://localhost.evil.example:5173")).toBe(false);
    expect(policy.allows("null")).toBe(false);
  });

  it.each([{ FLY_APP_NAME: "rtc-clone-server" }, { RTC_DEPLOYED: "1" }])(
    "refuses to start on a deployed machine without the setting (%o)",
    (env) => {
      expect(() => {
        return resolveOriginPolicy(env);
      }).toThrow("RTC_ALLOWED_ORIGINS must be set on a deployed server");
    },
  );

  it("treats a blank setting as unset", () => {
    expect(resolveOriginPolicy({ RTC_ALLOWED_ORIGINS: "  " }).kind).toBe(
      "localhost",
    );
  });
});

describe("isJsonContentType", () => {
  it.each([
    "application/json",
    "Application/JSON",
    "application/json; charset=utf-8",
    " application/json ;charset=UTF-8",
  ])("accepts %s", (value) => {
    expect(isJsonContentType(value)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "text/plain",
    "application/x-www-form-urlencoded",
    "application/jsonx",
    "multipart/form-data; boundary=x",
  ])("refuses %s", (value) => {
    expect(isJsonContentType(value)).toBe(false);
  });
});
