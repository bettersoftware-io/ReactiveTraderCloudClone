import { renderHook } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { useFxView } from "./useFxView";

describe("useFxView", () => {
  it("throws when rendered outside a FxViewProvider", () => {
    expect(() => {
      renderHook(() => {
        return useFxView();
      });
    }).toThrow("useFxView must be used within a FxViewProvider");
  });
});
