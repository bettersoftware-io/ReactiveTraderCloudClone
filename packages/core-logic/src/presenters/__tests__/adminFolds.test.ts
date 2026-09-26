import { describe, expect, it } from "vitest";

import type { LogEvent, MetricSample } from "@rtc/domain";
import { MAX_LOG_ROWS, METRIC_WINDOW } from "@rtc/domain";

import {
  appendMetricSample,
  prependLogEvent,
  THROUGHPUT_SET_ERROR,
  throughputSetMessage,
} from "#/presenters/adminFolds";

describe("adminFolds", () => {
  it("appendMetricSample appends the new sample at the end", () => {
    const a = createSample(1);
    const b = createSample(2);

    expect(appendMetricSample([a], b)).toEqual([a, b]);
  });

  it("appendMetricSample keeps only the newest METRIC_WINDOW samples", () => {
    const full = Array.from({ length: METRIC_WINDOW }, (_, i) => {
      return createSample(i);
    });
    const fresh = createSample(METRIC_WINDOW);

    const result = appendMetricSample(full, fresh);

    expect(result).toHaveLength(METRIC_WINDOW);
    expect(result[0]).toBe(full[1]);
    expect(result[result.length - 1]).toBe(fresh);
  });

  it("appendMetricSample does not mutate its input", () => {
    const window = [createSample(1)];
    const before = [...window];

    appendMetricSample(window, createSample(2));

    expect(window).toEqual(before);
  });

  it("prependLogEvent prepends the new event and keeps only the first MAX_LOG_ROWS, dropping the oldest", () => {
    const full = Array.from({ length: MAX_LOG_ROWS }, (_, i) => {
      return createEvent(`m${i}`);
    });
    const fresh = createEvent("new");

    const result = prependLogEvent(full, fresh);

    expect(result).toHaveLength(MAX_LOG_ROWS);
    expect(result[0]).toBe(fresh);
    expect(result).not.toContain(full[full.length - 1]);
  });

  it("throughputSetMessage formats the confirmation banner text", () => {
    expect(throughputSetMessage(250)).toBe("Throughput has been set to 250");
  });

  it("THROUGHPUT_SET_ERROR is the failed-write banner text", () => {
    expect(THROUGHPUT_SET_ERROR).toBe("Error setting throughput");
  });

  function createSample(value: number): MetricSample {
    return { t: value, value };
  }

  function createEvent(message: string): LogEvent {
    return { t: 0, severity: "info", service: "pricing", message };
  }
});
