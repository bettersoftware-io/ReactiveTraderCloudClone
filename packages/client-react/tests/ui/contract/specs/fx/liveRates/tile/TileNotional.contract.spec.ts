import { TileNotional } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import type { NotionalLike } from "@ui-contract/pages/fx/liveRates/tile/TileNotionalPage";
import { describe, expect, it } from "vitest";

describe("TileNotional", () => {
  it("shows the base currency label and the formatted value", () => {
    const n = mount(TileNotional, {
      props: { notional: notional(), baseCurrency: "EUR" },
    });
    expect(n.currencyLabel()).toBe("EUR");
    expect(n.value()).toBe("1,000,000");
  });

  it("hides the reset button when the notional is at its default", () => {
    const n = mount(TileNotional, {
      props: { notional: notional({ isDefault: true }), baseCurrency: "EUR" },
    });
    expect(n.hasResetButton()).toBe(false);
  });

  it("shows the reset button when the notional differs from default", () => {
    const n = mount(TileNotional, {
      props: { notional: notional({ isDefault: false }), baseCurrency: "EUR" },
    });
    expect(n.hasResetButton()).toBe(true);
  });

  it("reports edits through change", async () => {
    const edits: string[] = [];
    const n = mount(TileNotional, {
      props: {
        notional: notional(
          {},
          {
            change: (v: string) => {
              return edits.push(v);
            },
          },
        ),
        baseCurrency: "EUR",
      },
    });
    n.changeInput("2,500");
    expect(edits).toContain("2,500");
  });

  it("invokes reset when the reset button is clicked", async () => {
    let reset = 0;
    const n = mount(TileNotional, {
      props: {
        notional: notional(
          { isDefault: false },
          {
            reset: () => {
              reset += 1;
            },
          },
        ),
        baseCurrency: "EUR",
      },
    });
    await n.clickReset();
    expect(reset).toBe(1);
  });

  it("renders the error message and red underline when in error", () => {
    const n = mount(TileNotional, {
      props: {
        notional: notional({
          error: "Invalid input",
          displayValue: "abc",
          isDefault: false,
        }),
        baseCurrency: "EUR",
      },
    });
    expect(n.errorText()).toBe("Invalid input");
    expect(n.borderBottomColor()).toContain("var(--accent-negative)");
  });

  it("disables the input when disabled", () => {
    const n = mount(TileNotional, {
      props: { notional: notional(), baseCurrency: "EUR", disabled: true },
    });
    expect(n.isDisabled()).toBe(true);
  });

  it("blurs the input on Enter and ignores other keys", () => {
    const n = mount(TileNotional, {
      props: { notional: notional(), baseCurrency: "EUR" },
    });
    n.focusInput();
    expect(n.isInputFocused()).toBe(true);
    n.pressOtherKey();
    expect(n.isInputFocused()).toBe(true);
    n.pressEnter();
    expect(n.isInputFocused()).toBe(false);
  });

  it("selects the field contents on focus", () => {
    const n = mount(TileNotional, {
      props: { notional: notional(), baseCurrency: "EUR" },
    });
    n.focusInput();
    // selection spans the whole value (focus handler calls select()).
    expect(n.input().selectionStart).toBe(0);
    expect(n.input().selectionEnd).toBe(n.value().length);
  });

  it("re-renders the value when the notional prop changes", () => {
    const n = mount(TileNotional, {
      props: { notional: notional(), baseCurrency: "EUR" },
    });
    n.setProps({
      notional: notional({ displayValue: "5,000,000", isDefault: false }),
    });
    expect(n.value()).toBe("5,000,000");
    expect(n.hasResetButton()).toBe(true);
  });
});

function notional(
  stateOver: Partial<NotionalLike["state"]> = {},
  intentsOver: Partial<Omit<NotionalLike, "state">> = {},
): NotionalLike {
  return {
    state: {
      displayValue: "1,000,000",
      numericValue: 1_000_000,
      error: null,
      isRfq: false,
      isDefault: true,
      ...stateOver,
    },
    change: () => {},
    reset: () => {},
    ...intentsOver,
  };
}
