import { isIP } from "node:net";

import { describe, expect, it } from "vitest";

import {
  type ClientIpSource,
  collapseToNetworkKey,
  resolveClientIp,
  resolveTrustedIpHeader,
  TRUSTED_IP_HEADER_DEFAULT,
  widerNetworkKeyOf,
} from "#/http/clientIp";

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

  it("keys an IPv6 caller by its /64, from the header or the socket", () => {
    const fromHeader = createRequest({
      "fly-client-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd",
    });

    const fromSocket: ClientIpSource = {
      headers: {},
      socket: { remoteAddress: "2001:DB8:1:2::99" },
    };

    expect(resolveClientIp(fromHeader, "fly-client-ip")).toBe("2001:db8:1:2::");
    expect(resolveClientIp(fromSocket, "fly-client-ip")).toBe("2001:db8:1:2::");
  });

  it("reads an IPv4-mapped socket address as the IPv4 caller", () => {
    const req: ClientIpSource = {
      headers: {},
      socket: { remoteAddress: "::ffff:203.0.113.9" },
    };

    expect(resolveClientIp(req, "fly-client-ip")).toBe("203.0.113.9");
  });

  it("takes the first value of a repeated header", () => {
    const req: ClientIpSource = {
      headers: { "fly-client-ip": ["203.0.113.9", "198.51.100.1"] },
      socket: {},
    };

    expect(resolveClientIp(req, "fly-client-ip")).toBe("203.0.113.9");
  });
});

describe("collapseToNetworkKey", () => {
  it("leaves an IPv4 address unchanged", () => {
    expect(collapseToNetworkKey("203.0.113.9")).toBe("203.0.113.9");
  });

  it.each([
    ["the full form", "2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::"],
    ["a leading ::", "::2:3:4:5:6", "0:0:0:2::"],
    ["an inner :: in the network half", "2001:db8::1:2:3", "2001:db8:0:0::"],
    ["an inner :: in the host half", "2001:db8:1:2:3::4", "2001:db8:1:2::"],
    ["a trailing ::", "2001:db8:1::", "2001:db8:1:0::"],
    ["leading zeros", "2001:0db8:0001:0002:0:0:0:1", "2001:db8:1:2::"],
    ["upper case", "2001:DB8:ABCD:12::1", "2001:db8:abcd:12::"],
    ["a zone id", "fe80::1%eth0", "fe80:0:0:0::"],
    ["the loopback", "::1", "0:0:0:0::"],
    ["the unspecified address", "::", "0:0:0:0::"],
    ["an embedded IPv4 tail", "64:ff9b::192.0.2.1", "64:ff9b:0:0::"],
  ])(
    "collapses %s to its /64",
    (_label: string, address: string, key: string) => {
      expect(collapseToNetworkKey(address)).toBe(key);
    },
  );

  it.each([
    ["dotted", "::ffff:203.0.113.9"],
    ["upper-case", "::FFFF:203.0.113.9"],
    ["hex", "::ffff:cb00:7109"],
  ])(
    "reads a %s IPv4-mapped address as the IPv4 address",
    (_label: string, address: string) => {
      expect(collapseToNetworkKey(address)).toBe("203.0.113.9");
    },
  );

  it("gives every address in one /64 the same key", () => {
    expect(collapseToNetworkKey("2001:db8:1:2::1")).toBe(
      collapseToNetworkKey("2001:db8:1:2:ffff:ffff:ffff:ffff"),
    );
    expect(collapseToNetworkKey("2001:db8:1:2::1")).not.toBe(
      collapseToNetworkKey("2001:db8:1:3::1"),
    );
  });

  it("keeps an unparseable value as it was", () => {
    expect(collapseToNetworkKey("unknown")).toBe("unknown");
    expect(collapseToNetworkKey("2001:db8::1::2")).toBe("2001:db8::1::2");
  });

  it("produces a key that is itself a valid IPv6 address", () => {
    expect(isIP(collapseToNetworkKey("2001:db8:1:2::99"))).toBe(6);
    expect(isIP(collapseToNetworkKey("::1"))).toBe(6);
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

describe("widerNetworkKeyOf", () => {
  it("gives the /48 of an IPv6 /64 key", () => {
    expect(widerNetworkKeyOf("2001:db8:1:2::")).toBe("2001:db8:1::");
    expect(widerNetworkKeyOf("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1::");
  });

  it("is null for IPv4, an IPv4-mapped address and anything unparsable", () => {
    expect(widerNetworkKeyOf("203.0.113.9")).toBeNull();
    expect(widerNetworkKeyOf("::ffff:203.0.113.9")).toBeNull();
    expect(widerNetworkKeyOf("unknown")).toBeNull();
  });
});

function createRequest(
  headers: Record<string, string | string[]>,
): ClientIpSource {
  return { headers, socket: { remoteAddress: "10.0.0.2" } };
}
