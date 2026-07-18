import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { NewRfqPanel } from "#/credit/NewRfq/NewRfqPanel";
import { useCreditForm } from "#/credit/useCreditForm";

afterEach(cleanup);

describe("NewRfqPanel", () => {
  test("renders the form controls and a disabled SEND until valid", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });

    const { getByText, getByPlaceholderText } = render(
      <NewRfqPanel form={result.current} onSend={vi.fn()} />,
    );
    expect(getByText("You Buy")).toBeTruthy();
    expect(getByText("Select instrument")).toBeTruthy();
    expect(getByPlaceholderText("0")).toBeTruthy();
    const send = getByText("SEND RFQ");
    expect(send.getAttribute("data-enabled")).toBe("false");
  });

  test("selecting an instrument, qty and a dealer enables SEND", () => {
    const { result } = renderHook(() => {
      return useCreditForm();
    });
    const onSend = vi.fn();
    const view = render(<NewRfqPanel form={result.current} onSend={onSend} />);

    // useCreditForm lives in a separate render tree (the house renderHook +
    // render(<Component api={result.current} />) pattern, cf. fx-blotter), so
    // reflect the form state into the panel where the next step needs the DOM
    // updated: once to open the instrument dropdown, once to read data-enabled.
    fireEvent.click(view.getByText("Select instrument"));
    view.rerender(<NewRfqPanel form={result.current} onSend={onSend} />);

    fireEvent.click(view.getByText("MSFT 3.3 02/27"));
    fireEvent.change(view.getByPlaceholderText("0"), {
      target: { value: "500" },
    });
    fireEvent.click(view.getByText("Citi"));
    view.rerender(<NewRfqPanel form={result.current} onSend={onSend} />);

    expect(view.getByText("SEND RFQ").getAttribute("data-enabled")).toBe(
      "true",
    );
    expect(view.getAllByText("Adaptive Bank").length).toBeGreaterThan(0);
  });
});
