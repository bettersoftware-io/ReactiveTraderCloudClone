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

import { createThroughputPresenter } from "#/presenters/throughput";

describe("createThroughputPresenter (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls getThroughput() once at construction but subscribes it only on the first subscriber", () => {
    const admin = createScriptedAdmin();
    createThroughputPresenter(admin.port, new AbortController().signal);

    expect(admin.loadCalls()).toBe(1);
    expect(admin.load.observed).toBe(false);
  });

  it("starts loading, lands the loaded value, and falls back to the default when the load fails", async () => {
    const ok = createScriptedAdmin();
    const loaded = watch(
      createThroughputPresenter(ok.port, new AbortController().signal),
    );
    expect(loaded.last()).toEqual({
      value: DEFAULT_THROUGHPUT,
      loading: true,
      message: null,
    });
    ok.load.next(250);
    await vi.advanceTimersByTimeAsync(0);
    expect(loaded.last()).toEqual({
      value: 250,
      loading: false,
      message: null,
    });

    const bad = createScriptedAdmin();
    const failed = watch(
      createThroughputPresenter(bad.port, new AbortController().signal),
    );
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
    const presenter = createThroughputPresenter(
      admin.port,
      new AbortController().signal,
    );
    const view = watch(presenter);
    presenter.setValue(200);
    await vi.advanceTimersByTimeAsync(100);
    presenter.setValue(300);

    expect(view.last().value).toBe(300);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS - 1);
    expect(admin.writes()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(admin.writes()).toEqual([300]);
  });

  it("shows the success banner and clears it exactly THROUGHPUT_MESSAGE_DISMISS_MS later", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(
      admin.port,
      new AbortController().signal,
    );
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

  it("shows the error banner when the write fails", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(
      admin.port,
      new AbortController().signal,
    );
    const view = watch(presenter);
    presenter.setValue(400);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    admin.failWrite(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(view.last().message).toEqual({
      text: THROUGHPUT_SET_ERROR,
      isError: true,
    });
  });

  it("supersedes at the DEBOUNCE, not the keystroke: a new setValue leaves write b in flight until its own debounce fires", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(
      admin.port,
      new AbortController().signal,
    );
    const view = watch(presenter);
    presenter.setValue(500);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    presenter.setValue(600);

    expect(admin.writeObserved(0)).toBe(true);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    expect(admin.writeObserved(0)).toBe(false);
    admin.resolveWrite(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.last().message).toBeNull();
    expect(admin.writes()).toEqual([500, 600]);
  });

  it("a write resolved before the next debounce shows its banner, and the next debounce drops that banner's dismiss timer with it", async () => {
    const admin = createScriptedAdmin();
    const presenter = createThroughputPresenter(
      admin.port,
      new AbortController().signal,
    );
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
    // b's dismiss was dropped with it; c's write is still unresolved.
    expect(view.last().message).toEqual({
      text: throughputSetMessage(500),
      isError: false,
    });
  });

  it("after the lifetime aborts, setValue neither writes nor echoes", async () => {
    const admin = createScriptedAdmin();
    const lifetime = new AbortController();
    const presenter = createThroughputPresenter(admin.port, lifetime.signal);
    const view = watch(presenter);
    presenter.setValue(700);
    lifetime.abort();
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    presenter.setValue(800);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);

    expect(admin.writes()).toEqual([]);
    expect(view.last().value).toBe(700);
  });

  it("a lifetime abort releases an in-flight write, and its late resolution shows no banner", async () => {
    const admin = createScriptedAdmin();
    const lifetime = new AbortController();
    const presenter = createThroughputPresenter(admin.port, lifetime.signal);
    const view = watch(presenter);
    presenter.setValue(700);
    await vi.advanceTimersByTimeAsync(THROUGHPUT_DEBOUNCE_MS);
    expect(admin.writeObserved(0)).toBe(true);

    lifetime.abort();
    expect(admin.writeObserved(0)).toBe(false);
    admin.resolveWrite(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.last().message).toBeNull();
  });

  it("a lifetime abort mid-debounce leaves no timer behind", async () => {
    const admin = createScriptedAdmin();
    const lifetime = new AbortController();
    const presenter = createThroughputPresenter(admin.port, lifetime.signal);
    presenter.setValue(700);
    expect(vi.getTimerCount()).toBe(1);

    lifetime.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

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

interface ScriptedAdmin {
  readonly port: AdminPort;
  readonly load: Subject<number>;
  loadCalls(): number;
  writes(): readonly number[];
  writeObserved(index: number): boolean;
  resolveWrite(index: number): void;
  failWrite(index: number): void;
}

function createScriptedAdmin(): ScriptedAdmin {
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
