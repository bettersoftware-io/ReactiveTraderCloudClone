import { useEffect, useRef, useState } from "react";

import {
  EVENT_CAP,
  EVENT_EVERY_TICKS,
  EVENT_POOL,
  SEED_EVENTS,
  seedLatBars,
  seedMetrics,
  stepMetrics,
  TICK_MS,
} from "#/admin/adminData";
import type { AdminEvent, AdminMetrics, LatBar } from "#/admin/types";

export interface AdminApi {
  metrics: AdminMetrics;
  events: AdminEvent[];
  latBars: LatBar[];
}

export interface UseAdminMetricsOptions {
  rng?: () => number;
  intervalMs?: number;
}

interface Seed {
  metrics: AdminMetrics;
  latBars: LatBar[];
  events: AdminEvent[];
}

function timeNow(): string {
  return new Date().toTimeString().slice(0, 8);
}

function seedEvents(): AdminEvent[] {
  return SEED_EVENTS.map((e, i) => {
    return { ...e, id: i + 1 };
  });
}

export function useAdminMetrics(opts: UseAdminMetricsOptions = {}): AdminApi {
  const { rng = Math.random, intervalMs = TICK_MS } = opts;
  const rngRef = useRef(rng);

  // Seed once via render-body ref-lazy-init, NOT a useState initializer:
  // StrictMode double-invokes those, which would draw the RNG twice before the
  // first commit. The ref persists across the double render, so each seed runs once.
  const seedRef = useRef<Seed | null>(null);

  if (seedRef.current === null) {
    seedRef.current = {
      metrics: seedMetrics(rngRef.current),
      latBars: seedLatBars(rngRef.current),
      events: seedEvents(),
    };
  }

  const [metrics, setMetrics] = useState<AdminMetrics>(seedRef.current.metrics);
  const [events, setEvents] = useState<AdminEvent[]>(seedRef.current.events);
  const [latBars] = useState<LatBar[]>(seedRef.current.latBars);

  const tickRef = useRef(0);
  const seqRef = useRef(SEED_EVENTS.length);

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((prev) => {
        return stepMetrics(prev, rngRef.current);
      });
      tickRef.current += 1;

      if (tickRef.current % EVENT_EVERY_TICKS === 0) {
        const pick =
          EVENT_POOL[Math.floor(rngRef.current() * EVENT_POOL.length)];
        seqRef.current += 1;
        const ev: AdminEvent = {
          id: seqRef.current,
          t: timeNow(),
          sev: pick.sev,
          svc: pick.svc,
          msg: pick.msg,
        };
        setEvents((prev) => {
          return [ev, ...prev].slice(0, EVENT_CAP);
        });
      }
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return { metrics, events, latBars };
}
