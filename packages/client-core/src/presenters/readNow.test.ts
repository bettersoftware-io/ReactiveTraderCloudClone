import { BehaviorSubject, EMPTY, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { readNow } from "./readNow";

describe("readNow", () => {
  it("returns the value a replay-current source emits on subscribe", () => {
    const source = new BehaviorSubject("live");
    expect(readNow(source, "fallback")).toBe("live");
  });

  it("returns the fallback when the source does not emit on subscribe", () => {
    expect(readNow(EMPTY, "fallback")).toBe("fallback");
  });

  it("throws a synchronous source error", () => {
    const boom = new Error("boom");
    const source = throwError(() => {
      return boom;
    });
    expect(() => {
      readNow(source, "fallback");
    }).toThrow(boom);
  });
});
