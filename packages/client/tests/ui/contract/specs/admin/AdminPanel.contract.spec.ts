import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, cleanupMounted } from "@ui-contract/mount";
import { AdminPanel } from "@ui-contract/components";

const okJson = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as Response;

/** Typed fetch stub: preserves the [input, init?] call tuple for PUT assertions. */
function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl);
}

const isPut = (call: [RequestInfo | URL, RequestInit?]): boolean =>
  call[1]?.method === "PUT";

const putBody = (call: [RequestInfo | URL, RequestInit?]): unknown =>
  JSON.parse(call[1]!.body as string);

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanupMounted();
  vi.unstubAllGlobals();
});

describe("AdminPanel", () => {
  it("shows a loading placeholder until the initial throughput arrives", () => {
    // Never-resolving fetch keeps the panel in its loading state.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const panel = mount(AdminPanel);
    expect(panel.isLoading()).toBe(true);
  });

  it("renders the throughput control seeded from the server value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson({ value: 250 })));
    const panel = mount(AdminPanel);
    await panel.waitUntilLoaded();
    expect(panel.heading()).toBe("Throughput Control");
    expect(panel.value()).toBe(250);
    expect(panel.sliderValue()).toBe(250);
    expect(panel.message()).toBeNull();
  });

  it("persists an edited value and confirms it through a status banner", async () => {
    const fetchMock = mockFetch(async () => okJson({ value: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    const panel = mount(AdminPanel);
    await panel.waitUntilLoaded();

    await panel.setValue(420);
    expect(panel.value()).toBe(420);

    // Wait for the debounced PUT to fire and the success banner to show.
    await vi.waitFor(() => expect(panel.message()).toMatch(/has been set to 420/i));

    const puts = fetchMock.mock.calls.filter(isPut);
    expect(puts.length).toBeGreaterThanOrEqual(1);
    expect(putBody(puts[puts.length - 1])).toEqual({ value: 420 });
  });

  it("mirrors a slider move into the numeric input and persists it", async () => {
    const fetchMock = vi.fn(async () => okJson({ value: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    const panel = mount(AdminPanel);
    await panel.waitUntilLoaded();

    panel.dragSlider(600);
    expect(panel.value()).toBe(600);
    expect(panel.sliderValue()).toBe(600);

    await vi.waitFor(() => expect(panel.message()).toMatch(/has been set to 600/i));
  });

  it("rejects an out-of-range numeric entry", async () => {
    const fetchMock = vi.fn(async () => okJson({ value: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    const panel = mount(AdminPanel);
    await panel.waitUntilLoaded();

    // 2000 exceeds the 0..1000 range; the last in-range keystroke (200) sticks.
    await panel.setValue(2000);
    expect(panel.value()).toBe(200);
  });

  it("shows an error banner when the server rejects the update", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ value: 100 }))
      .mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const panel = mount(AdminPanel);
    await panel.waitUntilLoaded();

    panel.dragSlider(800);
    await vi.waitFor(() => expect(panel.message()).toMatch(/error setting throughput/i));
  });
});
