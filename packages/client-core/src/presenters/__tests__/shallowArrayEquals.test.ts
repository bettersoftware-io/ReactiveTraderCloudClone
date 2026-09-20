import { describe, expect, it } from "vitest";

import {
  createShallowArrayMemo,
  shallowArrayEquals,
} from "../shallowArrayEquals.js";

describe("shallowArrayEquals", () => {
  it("is true for the same reference, equal elements by reference, and false on length or element mismatch", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const list = [a, b];
    expect(shallowArrayEquals(list, list)).toBe(true);
    expect(shallowArrayEquals([a, b], [a, b])).toBe(true);
    expect(shallowArrayEquals([a], [a, b])).toBe(false);
    expect(shallowArrayEquals([a, b], [a, { id: 2 }])).toBe(false);
  });
});

describe("createShallowArrayMemo", () => {
  it("hands back the PREVIOUS array when the projection is shallow-equal, and the new one otherwise", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const project = createShallowArrayMemo((source: Map<number, object>) => {
      return Array.from(source.values());
    });
    const first = project(new Map([[1, a]]));
    const same = project(new Map([[1, a]]));
    expect(same).toBe(first);
    const grown = project(
      new Map([
        [1, a],
        [2, b],
      ]),
    );
    expect(grown).not.toBe(first);
    expect(grown).toEqual([a, b]);
    expect(project(new Map([[2, b]]))).toEqual([b]);
  });
});
