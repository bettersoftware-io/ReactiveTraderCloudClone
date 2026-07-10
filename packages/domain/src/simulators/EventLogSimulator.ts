import {
  BehaviorSubject,
  concat,
  defer,
  from,
  interval,
  type Observable,
} from "rxjs";
import { map } from "rxjs/operators";

import type { EventLogPort } from "../ports/eventLogPort.js";
import type { LogEvent, Severity } from "../telemetry/log.js";
import { mulberry32 } from "../telemetry/prng.js";
import type { ServiceName } from "../telemetry/topology.js";
import type { MetricControl, Perturbation } from "./perturbation.js";

const SERVICE_NAMES: readonly ServiceName[] = [
  "pricing",
  "execution",
  "blotter",
  "analytics",
  "credit",
  "refdata",
  "kernel",
];

const MESSAGES: Readonly<Record<Severity, readonly string[]>> = {
  info: [
    "Request processed successfully",
    "Connection established",
    "Subscription updated",
    "Heartbeat acknowledged",
  ],
  warn: [
    "Slow response detected",
    "Retry attempt initiated",
    "High memory usage",
    "Queue depth elevated",
  ],
  error: [
    "Connection lost",
    "Request timeout",
    "Service unavailable",
    "Unexpected exception",
  ],
};

interface SeedEvent {
  readonly severity: Severity;
  readonly service: ServiceName;
  readonly message: string;
  readonly ageMs: number;
}

/** PROTO seedEvents (dc.html L796-803), oldest first, back-dated from "now". */
const SEED_EVENTS: readonly SeedEvent[] = [
  {
    severity: "info",
    service: "kernel",
    message: "Secure enclave mounted · AES-256",
    ageMs: 310_000,
  },
  {
    severity: "info",
    service: "execution",
    message: "Gateway handshake complete",
    ageMs: 250_000,
  },
  {
    severity: "info",
    service: "pricing",
    message: "Subscribed 8 instruments",
    ageMs: 190_000,
  },
  {
    severity: "error",
    service: "refdata",
    message: "Upstream timeout · retry 1/3 scheduled",
    ageMs: 130_000,
  },
  {
    severity: "warn",
    service: "refdata",
    message: "Latency 48ms exceeds 40ms SLO",
    ageMs: 70_000,
  },
  {
    severity: "info",
    service: "analytics",
    message: "Snapshot recomputed in 38ms",
    ageMs: 10_000,
  },
];

export class EventLogSimulator implements EventLogPort, MetricControl {
  private readonly rng: () => number;

  private readonly perturbation$ = new BehaviorSubject<Perturbation | null>(
    null,
  );

  constructor(seed = 4) {
    this.rng = mulberry32(seed);
  }

  perturb(kind: Perturbation): void {
    this.perturbation$.next(kind);
  }

  clearPerturbation(): void {
    this.perturbation$.next(null);
  }

  private pickSeverity(): Severity {
    const p = this.perturbation$.getValue();
    const r = this.rng();

    if (p === "errorBurst") {
      // 10% info, 10% warn, 80% error
      if (r < 0.1) {
        return "info";
      }

      if (r < 0.2) {
        return "warn";
      }

      return "error";
    }

    // 70% info, 20% warn, 10% error
    if (r < 0.7) {
      return "info";
    }

    if (r < 0.9) {
      return "warn";
    }

    return "error";
  }

  private generateEvent(): LogEvent {
    const severity = this.pickSeverity();
    const serviceIdx = Math.floor(this.rng() * SERVICE_NAMES.length);
    const service = SERVICE_NAMES[serviceIdx] ?? "kernel";
    const msgs = MESSAGES[severity];
    const msgIdx = Math.floor(this.rng() * msgs.length);
    const message = msgs[msgIdx] ?? "Event occurred";
    return { t: Date.now(), severity, service, message };
  }

  events$(): Observable<LogEvent> {
    return defer(() => {
      const now = Date.now();
      const seeds: LogEvent[] = SEED_EVENTS.map((s) => {
        return {
          t: now - s.ageMs,
          severity: s.severity,
          service: s.service,
          message: s.message,
        };
      });
      return concat(
        from(seeds),
        interval(500).pipe(
          map(() => {
            return this.generateEvent();
          }),
        ),
      );
    });
  }
}
