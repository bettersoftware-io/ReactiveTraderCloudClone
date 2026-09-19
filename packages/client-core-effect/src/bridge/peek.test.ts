import { Option } from "effect";
import { BehaviorSubject, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { peek, peekCurrent } from "#/bridge/peek";

describe("bridge/peek", () => {
  it("peek() reads a replay-current source synchronously and leaves nothing warm", () => {
    const source = new BehaviorSubject("a");
    expect(peek(source, "z")).toBe("a");
    expect(source.observed).toBe(false);
  });

  it("peek() returns the fallback for a source that does not emit on subscribe", () => {
    expect(peek(new Subject<string>(), "z")).toBe("z");
  });

  it("peekCurrent() is Some of the current value of a replay-current source", () => {
    expect(peekCurrent(new BehaviorSubject("a"))).toEqual(Option.some("a"));
  });

  it("peekCurrent() is None for a source that does not emit on subscribe", () => {
    expect(Option.isNone(peekCurrent(new Subject<string>()))).toBe(true);
  });

  it("peek() throws a source's synchronous error at the read site", () => {
    const boom = new Error("boom");
    expect(() => {
      peek(
        throwError(() => {
          return boom;
        }),
        "z",
      );
    }).toThrow(boom);
  });
});
