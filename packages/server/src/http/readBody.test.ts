import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  BodyTooLargeError,
  declaredLengthExceeds,
  readBodyWithLimit,
} from "#/http/readBody";

describe("readBodyWithLimit", () => {
  it("returns the full body when under the cap", async () => {
    const req = createRequest(['{"a":', "1}"]);

    await expect(readBodyWithLimit(req, 64)).resolves.toBe('{"a":1}');
    expect(req.destroyed).toBe(false);
    expect(req.isPaused()).toBe(false);
  });

  it("accepts a body of exactly the cap", async () => {
    const req = createRequest(["x".repeat(32), "y".repeat(32)]);

    await expect(readBodyWithLimit(req, 64)).resolves.toBe(
      `${"x".repeat(32)}${"y".repeat(32)}`,
    );
  });

  it("rejects with BodyTooLargeError and stops reading (paused, listener gone) once the received bytes exceed the cap", async () => {
    const req = createRequest(["x".repeat(40), "y".repeat(40)]);

    await expect(readBodyWithLimit(req, 64)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
    expect(req.isPaused()).toBe(true);
    expect(req.listenerCount("data")).toBe(0);
  });

  it("names the limit on the error", async () => {
    const req = createRequest(["x".repeat(100)]);

    await expect(readBodyWithLimit(req, 64)).rejects.toMatchObject({
      name: "BodyTooLargeError",
      limit: 64,
    });
  });

  it("a body longer than its declared length is cut at the cap (Content-Length is not trusted)", async () => {
    const req = createRequest(["x".repeat(100)], { "content-length": "10" });

    await expect(readBodyWithLimit(req, 64)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
    expect(req.isPaused()).toBe(true);
    expect(req.listenerCount("data")).toBe(0);
  });

  it("counts bytes, not characters — a multi-byte body is measured in UTF-8", async () => {
    // "€" is 3 bytes in UTF-8; 30 of them are 90 bytes but only 30 characters.
    const req = createRequest(["€".repeat(30)]);

    await expect(readBodyWithLimit(req, 64)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
  });

  it("rejects with the stream's own error when the request fails mid-body", async () => {
    const failure = new Error("socket hang up");
    const req = createFailingRequest(failure);

    await expect(readBodyWithLimit(req, 64)).rejects.toBe(failure);
  });
});

describe("declaredLengthExceeds", () => {
  it("reads Content-Length when present and never trusts a missing one", () => {
    expect(declaredLengthExceeds({ "content-length": "65537" }, 65_536)).toBe(
      true,
    );
    expect(declaredLengthExceeds({ "content-length": "10" }, 65_536)).toBe(
      false,
    );
    expect(declaredLengthExceeds({}, 65_536)).toBe(false);
  });

  it("treats a length of exactly the cap as within it", () => {
    expect(declaredLengthExceeds({ "content-length": "65536" }, 65_536)).toBe(
      false,
    );
  });

  it("does not trust a non-numeric Content-Length — the reader must still count", () => {
    expect(declaredLengthExceeds({ "content-length": "lots" }, 65_536)).toBe(
      false,
    );
  });
});

type Headers = Record<string, string>;

/** A `Readable` carrying request headers, as `node:http`'s `IncomingMessage` does. */
type FakeRequest = Readable & { headers: Headers };

/**
 * `autoDestroy: false` mirrors the real `IncomingMessage` (the socket owns its
 * lifecycle), so the happy path can assert the reader never destroyed the
 * request itself — the HTTP layer answers 413 and closes the socket; a
 * destroyed request would have dropped the connection before the status.
 */
function createRequest(
  chunks: readonly string[],
  headers: Headers = {},
): FakeRequest {
  const readable = Readable.from(
    chunks.map((chunk: string): Buffer => {
      return Buffer.from(chunk, "utf8");
    }),
    { autoDestroy: false },
  ) as FakeRequest;

  readable.headers = headers;

  return readable;
}

function createFailingRequest(failure: Error): FakeRequest {
  const readable = new Readable({
    read(): void {
      this.destroy(failure);
    },
  }) as FakeRequest;

  readable.headers = {};

  return readable;
}
