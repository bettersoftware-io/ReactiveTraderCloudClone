import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THROUGHPUT_SET_ERROR, throughputSetMessage } from "@rtc/client-core";
import type { ThroughputPresenter, ThroughputView } from "@rtc/core-api";
import {
  type AdminPort,
  DEFAULT_THROUGHPUT,
  THROUGHPUT_DEBOUNCE_MS,
  THROUGHPUT_MESSAGE_DISMISS_MS,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createThroughputPresenter } from "#/presenters/throughput";

describe("createThroughputPresenter (effect)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await closeScope(host);
        await host.runtime.dispose();
      }
    }

    vi.useRealTimers();
  });

  it("calls getThroughput() once at construction but subscribes it only on the first subscriber", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(useHost(), admin.port);
    await vi.advanceTimersByTimeAsync(0);

    expect(admin.loadCalls()).toBe(1);
    expect(admin.load.observed).toBe(false);
    watch(presenter);
    await vi.advanceTimersByTimeAsync(0);
    expect(admin.load.observed).toBe(true);
  });

  it("starts loading, lands the loaded value, and falls back to the default when the load fails", async () => {
    const ok = createScriptedAdmin();
    const loaded = watch(createThroughputPresenter(useHost(), ok.port));
    expect(loaded.last()).toEqual({
      value: DEFAULT_THROUGHPUT,
      loading: true,
      message: null,
    });
    await vi.advanceTimersByTimeAsync(0);
    ok.load.next(250);
    await vi.advanceTimersByTimeAsync(0);
    expect(loaded.last()).toEqual({
      value: 250,
      loading: false,
      message: null,
    });

    const bad = createScriptedAdmin();
    const failed = watch(createThroughputPresenter(useHost(), bad.port));
    await vi.advanceTimersByTimeAsync(0);
    bad.load.error(new Error("down"));
    await vi.advanceTimersByTimeAsync(0);
    expect(failed.last()).toEqual({
      value: DEFAULT_THROUGHPUT,
      loading: false,
      message: null,
    });
  });

  it("echoes setValue at once, writes nothing before the debounce, and writes only the LAST of a burst", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(useHost(), admin.port);
    const view = watch(presenter);
    presenter.setValue(200);
    await vi.advanceTimersByTimeAsync(100);
    presenter.setValue(300);
    await vi.advanceTimersByTimeAsync(0);

    expect(view.last().value).toBe(300);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS - 1);
    expect(admin.writes()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(admin.writes()).toEqual([300]);
  });

  it("shows the success banner and clears it exactly THROUGHPUT_MESSAGE_DISMISS_MS later", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(useHost(), admin.port);
    const view = watch(presenter);
    presenter.setValue(400);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    admin.resolveWrite(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(view.last().message).toEqual({
      text: throughputSetMessage(400),
      isError: false,
    });
    await vi.advanceTimersByTimeAsync(THROUGHPUT_MESSAGE_DISMISS_MS - 1);
    expect(view.last().message).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(view.last().message).toBeNull();
  });

  it("shows the error banner when the write fails, and when the port throws synchronously", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(useHost(), admin.port);
    const view = watch(presenter);
    presenter.setValue(400);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    admin.failWrite(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.last().message).toEqual({
      text: THROUGHPUT_SET_ERROR,
      isError: true,
    });

    const throwing = createScriptedAdmin({ throwOnWrite: true });
    const other = createThroughputPresenter(useHost(), throwing.port);
    const otherView = watch(other);
    other.setValue(400);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    expect(otherView.last().message).toEqual({
      text: THROUGHPUT_SET_ERROR,
      isError: true,
    });
  });

  it("supersedes at the DEBOUNCE, not the keystroke: a new setValue leaves write b in flight until its own debounce fires", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(useHost(), admin.port);
    const view = watch(presenter);
    presenter.setValue(500);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    presenter.setValue(600);
    await vi.advanceTimersByTimeAsync(0);

    expect(admin.writeObserved(0)).toBe(true);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    expect(admin.writeObserved(0)).toBe(false);
    admin.resolveWrite(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.last().message).toBeNull();
    expect(admin.writes()).toEqual([500, 600]);
  });

  it("a write resolved before the next debounce shows its banner, and the next debounce drops that banner's dismiss with it", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(useHost(), admin.port);
    const view = watch(presenter);
    presenter.setValue(500);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    presenter.setValue(600);
    admin.resolveWrite(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.last().message).toEqual({
      text: throughputSetMessage(500),
      isError: false,
    });

    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_MESSAGE_DISMISS_MS);
    expect(view.last().message).toEqual({
      text: throughputSetMessage(500),
      isError: false,
    });
  });

  it("after the host scope closes, setValue neither writes nor echoes", async () => {
    const admin = createScriptedAdmin();
    const host = useHost();
    const presenter = createThroughputPresenter(host, admin.port);
    const view = watch(presenter);
    presenter.setValue(700);
    await closeScope(host);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    presenter.setValue(800);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);

    expect(admin.writes()).toEqual([]);
    expect(view.last().value).toBe(700);
  });

  it("closing the host scope releases an in-flight write, and its late resolution shows no banner", async () => {
    const admin = createScriptedAdmin();
    const host = useHost();
    const presenter = createThroughputPresenter(host, admin.port);
    const view = watch(presenter);
    presenter.setValue(700);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    expect(admin.writeObserved(0)).toBe(true);

    await closeScope(host);
    expect(admin.writeObserved(0)).toBe(false);
    admin.resolveWrite(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.last().message).toBeNull();
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

async function closeScope(host: EffectHost): Promise<void> {
  Effect.runFork(Scope.close(host.scope, Exit.void));
  await vi.advanceTimersByTimeAsync(0);
}

interface Watched {
  last(): ThroughputView;
}

function watch(presenter: ThroughputPresenter): Watched {
  let latest: ThroughputView | null = null;
  presenter.state$.subscribe((v) => {
    latest = v;
  });

  return {
    last: () => {
      if (latest === null) {
        throw new Error("no view yet");
      }

      return latest;
    },
  };
}

/** One `setThroughput` call and the reply the test settles. */
interface PendingWrite {
  readonly value: number;
  readonly reply: Subject<void>;
}

interface ScriptedAdminOptions {
  readonly throwOnWrite?: boolean;
}

interface ScriptedAdmin {
  readonly port: AdminPort;
  readonly load: Subject<number>;
  loadCalls(): number;
  writes(): readonly number[];
  writeObserved(index: number): boolean;
  resolveWrite(index: number): void;
  failWrite(index: number): void;
}

function createScriptedAdmin(
  options: ScriptedAdminOptions = {},
): ScriptedAdmin {
  const load = new Subject<number>();
  let loadCalls = 0;
  const writes: PendingWrite[] = [];

  return {
    port: {
      getThroughput: () => {
        loadCalls += 1;
        return load;
      },
      setThroughput: (value: number) => {
        if (options.throwOnWrite === true) {
          throw new Error("out of range");
        }

        const reply = new Subject<void>();
        writes.push({ value, reply });
        return reply;
      },
    },
    load,
    loadCalls: () => {
      return loadCalls;
    },
    writes: () => {
      return writes.map((w) => {
        return w.value;
      });
    },
    writeObserved: (index: number) => {
      return writes[index]?.reply.observed ?? false;
    },
    resolveWrite: (index: number) => {
      writes[index]?.reply.next();
      writes[index]?.reply.complete();
    },
    failWrite: (index: number) => {
      writes[index]?.reply.error(new Error("rejected"));
    },
  };
}
