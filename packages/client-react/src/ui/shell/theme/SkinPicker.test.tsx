import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { THEME_SKINS } from "@rtc/domain";

import { SkinPicker } from "./SkinPicker";
import { ThemeContext } from "./ThemeContext";

describe("SkinPicker", () => {
  it("renders one option per skin and calls setSkin on select", async () => {
    const setSkin = vi.fn();
    render(
      <ThemeContext.Provider
        value={{
          skin: "holo",
          mode: "dark",
          modePreference: "dark",
          setSkin,
          cycleMode: vi.fn(),
        }}
      >
        <SkinPicker />
      </ThemeContext.Provider>,
    );

    const select = screen.getByTestId("skin-picker");
    expect(select.querySelectorAll("option")).toHaveLength(THEME_SKINS.length);

    await userEvent.selectOptions(select, "terminal");
    expect(setSkin).toHaveBeenCalledWith("terminal");
  });
});
