import { renderHook } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { describe, expect, it } from "vitest";

import type { ViewModel } from "#/createViewModel";
import { useViewModel } from "#/useViewModel";
import { ViewModelProvider } from "#/ViewModelProvider";

describe("useViewModel", () => {
  it("throws when rendered outside a ViewModelProvider", () => {
    expect(() => {
      renderHook(() => {
        return useViewModel();
      });
    }).toThrow("useViewModel must be used within ViewModelProvider");
  });

  it("returns the ViewModel supplied by ViewModelProvider", () => {
    const viewModel = {} as ViewModel;

    const { result } = renderHook(
      () => {
        return useViewModel();
      },
      {
        wrapper: (props: WrapperProps): JSX.Element => {
          return (
            <ViewModelProvider viewModel={viewModel}>
              {props.children}
            </ViewModelProvider>
          );
        },
      },
    );

    expect(result).toBe(viewModel);
  });
});

interface WrapperProps {
  children: JSX.Element;
}
