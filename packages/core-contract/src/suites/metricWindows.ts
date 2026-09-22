import { describe, expect, it } from "vitest";

import type { App, Stream } from "@rtc/core-api";
import { METRIC_WINDOW, type MetricSample } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness, Suite } from "#/harness/harness";
import type { ScriptedDriver } from "#/harness/scriptedPorts";
import { settle } from "#/harness/settle";

/** Reads the member's rolling-window stream off the composed app. */
type SelectSamples = (app: App) => Stream<readonly MetricSample[]>;

/** Pushes one sample into the member's OWN telemetry method. */
type EmitSample = (driver: ScriptedDriver, sample: MetricSample) => void;

function emitThroughputSample(
  driver: ScriptedDriver,
  sample: MetricSample,
): void {
  driver.emitThroughputSample(sample);
}

function emitLatencySample(driver: ScriptedDriver, sample: MetricSample): void {
  driver.emitLatencySample(sample);
}

function emitErrorRateSample(
  driver: ScriptedDriver,
  sample: MetricSample,
): void {
  driver.emitErrorRateSample(sample);
}

/** The three telemetry emitters, shared by reference so the isolation case
 * (below) can find "some other member's emitter" without a fourth
 * parameter. */
const TELEMETRY_EMITTERS: readonly EmitSample[] = [
  emitThroughputSample,
  emitLatencySample,
  emitErrorRateSample,
];

/** `throughputMetric`, `latencyMetric`, `errorRateMetric` (ruling 3): warm
 * folds over a telemetry stream — synchronous `[]` seed, append-and-truncate
 * to `METRIC_WINDOW`, retained across a full unsubscribe (`refCount:
 * false`), and isolated from the other two telemetry methods. One
 * parameterised builder shared by all three (Task 3 Step 1). */
export function describeMetricWindowContract(
  member: string,
  select: SelectSamples,
  emit: EmitSample,
): Suite {
  return (label: string, makeHarness: MakeHarness): void => {
    describe(`${label} :: ${member}`, () => {
      it("seeds an empty window synchronously, before any port emission", async () => {
        const h = makeHarness();

        try {
          const c = collect(select(h.app));
          expect(c.values).toEqual([[]]);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });

      it("appends each port sample, settled between", async () => {
        const h = makeHarness();

        try {
          const c = collect(select(h.app));
          const a = createMetricSample(1);
          const b = createMetricSample(2);
          emit(h.driver, a);
          await settle();
          emit(h.driver, b);
          await settle();
          expect(c.values.at(-1)).toEqual([a, b]);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });

      it(`truncates a burst to the newest ${METRIC_WINDOW} samples`, async () => {
        const h = makeHarness();

        try {
          const c = collect(select(h.app));
          const samples = createMetricSampleBurst(METRIC_WINDOW + 1);

          for (const sample of samples) {
            emit(h.driver, sample);
          }

          await settle();
          const last = c.values.at(-1);
          expect(last).toHaveLength(METRIC_WINDOW);
          expect(last?.[0]).toEqual(samples[1]);
          expect(last?.at(-1)).toEqual(samples.at(-1));
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });

      it("retains the window across a full unsubscribe for a late subscriber", async () => {
        const h = makeHarness();

        try {
          const c = collect(select(h.app));
          const a = createMetricSample(1);
          emit(h.driver, a);
          await settle();
          c.unsubscribe();
          const late = collect(select(h.app));
          expect(late.values).toEqual([[a]]);
          late.unsubscribe();
        } finally {
          await h.teardown();
        }
      });

      it("does not receive a sample emitted to a different telemetry method", async () => {
        const h = makeHarness();

        try {
          const c = collect(select(h.app));
          const other =
            TELEMETRY_EMITTERS.find((candidate) => {
              return candidate !== emit;
            }) ?? emitThroughputSample;
          other(h.driver, createMetricSample(1));
          await settle();
          expect(c.values).toEqual([[]]);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });
  };
}

export const describeThroughputMetricContract: Suite =
  describeMetricWindowContract(
    "throughputMetric",
    (app: App) => {
      return app.presenters.throughputMetric.samples$;
    },
    emitThroughputSample,
  );

export const describeLatencyMetricContract: Suite =
  describeMetricWindowContract(
    "latencyMetric",
    (app: App) => {
      return app.presenters.latencyMetric.samples$;
    },
    emitLatencySample,
  );

export const describeErrorRateMetricContract: Suite =
  describeMetricWindowContract(
    "errorRateMetric",
    (app: App) => {
      return app.presenters.errorRateMetric.samples$;
    },
    emitErrorRateSample,
  );

function createMetricSample(value: number): MetricSample {
  return { t: value, value };
}

function createMetricSampleBurst(count: number): readonly MetricSample[] {
  return Array.from({ length: count }, (_, index) => {
    return createMetricSample(index);
  });
}
