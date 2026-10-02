import { describe, expect, it } from "vitest";

import {
  type ClientIpSource,
  resolveClientIp,
  resolveTrustedIpHeader,
  TRUSTED_IP_HEADER_DEFAULT,
} from "./clientIp.js";

describe("resolveClientIp", () => {
  it("prefers the trusted header, trimmed", () => {
    const req = createRequest({ "fly-client-ip": " 203.0.113.9 " });

    expect(resolveClientIp(req, "fly-client-ip")).toBe("203.0.113.9");
  });

  it("ignores X-Forwarded-For entirely (its first hop is caller-supplied)", () => {
    const req = createRequest({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });

    expect(resolveClientIp(req, "fly-client-ip")).toBe("10.0.0.2");
  });

  it("reads only the header it was told to trust", () => {
    const req = createRequest({
      "cf-connecting-ip": "198.51.100.1",
      "fly-client-ip": "203.0.113.9",
    });

    expect(resolveClientIp(req, "cf-connecting-ip")).toBe("198.51.100.1");
  });

  it('falls back to the socket address, then to "unknown"', () => {
    expect(resolveClientIp(createRequest({}), "fly-client-ip")).toBe(
      "10.0.0.2",
    );
    expect(resolveClientIp({ headers: {}, socket: {} }, "fly-client-ip")).toBe(
      "unknown",
    );
  });

  it("treats a blank header value as absent", () => {
    const req = createRequest({ "fly-client-ip": "   " });

    expect(resolveClientIp(req, "fly-client-ip")).toBe("10.0.0.2");
  });

  it("takes the first value of a repeated header", () => {
    const req: ClientIpSource = {
      headers: { "fly-client-ip": ["203.0.113.9", "198.51.100.1"] },
      socket: {},
    };

    expect(resolveClientIp(req, "fly-client-ip")).toBe("203.0.113.9");
  });
});

describe("resolveTrustedIpHeader", () => {
  it("defaults to the platform header Fly sets", () => {
    expect(TRUSTED_IP_HEADER_DEFAULT).toBe("fly-client-ip");
    expect(resolveTrustedIpHeader({})).toBe(TRUSTED_IP_HEADER_DEFAULT);
  });

  it("lower-cases an override, since Node lower-cases incoming header names", () => {
    expect(
      resolveTrustedIpHeader({ RTC_TRUSTED_IP_HEADER: "CF-Connecting-IP" }),
    ).toBe("cf-connecting-ip");
  });

  it("treats a blank override as unset", () => {
    expect(resolveTrustedIpHeader({ RTC_TRUSTED_IP_HEADER: "  " })).toBe(
      TRUSTED_IP_HEADER_DEFAULT,
    );
  });
});

function createRequest(
  headers: Record<string, string | string[]>,
): ClientIpSource {
  return { headers, socket: { remoteAddress: "10.0.0.2" } };
}
