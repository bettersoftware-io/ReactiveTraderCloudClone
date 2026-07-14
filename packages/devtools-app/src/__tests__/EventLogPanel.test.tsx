import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { DevtoolsEvent, LogRow } from "@rtc/devtools-core";

import { EventLogPanel } from "#/panels/EventLogPanel";

afterEach(cleanup);

test("filters rows by free-text against the summary (case-insensitive)", () => {
  const log: LogRow[] = [
    logRow({ seq: 1, summary: "alpha stream registered" }),
    logRow({ seq: 2, summary: "beta machine created" }),
  ];

  render(<EventLogPanel log={log} />);

  expect(screen.getByText("alpha stream registered")).toBeTruthy();
  expect(screen.getByText("beta machine created")).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText("Filter by summary…"), {
    target: { value: "ALPHA" },
  });

  expect(screen.getByText("alpha stream registered")).toBeTruthy();
  expect(screen.queryByText("beta machine created")).toBeNull();
});

test("filters rows by kind: unchecking a prefix hides its rows", () => {
  const log: LogRow[] = [
    logRow({ seq: 1, kind: "stream:emission", summary: "stream row" }),
    logRow({ seq: 2, kind: "wire:in", summary: "wire row" }),
  ];

  render(<EventLogPanel log={log} />);

  expect(screen.getByText("stream row")).toBeTruthy();
  expect(screen.getByText("wire row")).toBeTruthy();

  fireEvent.click(screen.getByRole("checkbox", { name: "wire" }));

  expect(screen.getByText("stream row")).toBeTruthy();
  expect(screen.queryByText("wire row")).toBeNull();
});

test("pausing freezes the rendered rows while the log prop grows; unpausing resumes", () => {
  const initial: LogRow[] = [logRow({ seq: 1, summary: "first" })];
  const { rerender } = render(<EventLogPanel log={initial} />);

  expect(screen.getByText("first")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Pause" }));

  const grown: LogRow[] = [...initial, logRow({ seq: 2, summary: "second" })];
  rerender(<EventLogPanel log={grown} />);

  expect(screen.getByText("first")).toBeTruthy();
  expect(screen.queryByText("second")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Resume" }));

  expect(screen.getByText("first")).toBeTruthy();
  expect(screen.getByText("second")).toBeTruthy();
});

interface LogRowParams {
  seq: number;
  kind?: DevtoolsEvent["kind"];
  summary?: string;
}

function logRow({ seq, kind, summary }: LogRowParams): LogRow {
  const resolvedKind = kind ?? "stream:emission";

  return {
    seq,
    ts: 0,
    kind: resolvedKind,
    summary: summary ?? "summary",
    event: {
      kind: "stream:emission",
      seq,
      ts: 0,
      streamId: "s",
      value: null,
      coalesced: 1,
    },
  };
}
