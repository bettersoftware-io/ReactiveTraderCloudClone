import { describe, expect, it } from "vitest";

import { parseSseChunks } from "./openAiSse.js";

describe("parseSseChunks", () => {
  it("parses each data line of a stream into its JSON value", async () => {
    const chunks = await collectChunks([
      'data: {"n":1}\n\ndata: {"n":2}\n\n',
      "data: [DONE]\n\n",
    ]);

    expect(chunks).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("a chunk split across reads still parses", async () => {
    const chunks = await collectChunks([
      "da",
      'ta: {"text":"Good ',
      'morning"}',
      "\n",
      '\ndata: {"text":"sir"}\r',
      "\n\r\n",
      "data: [DONE]\n\n",
    ]);

    expect(chunks).toEqual([{ text: "Good morning" }, { text: "sir" }]);
  });

  it("a character split across reads decodes whole", async () => {
    const bytes = new TextEncoder().encode('data: {"text":"£"}\n\n');
    // `£` is two bytes in UTF-8; split between them.
    const splitAt = bytes.indexOf(0xc2) + 1;

    const chunks = await collectByteChunks([
      bytes.slice(0, splitAt),
      bytes.slice(splitAt),
    ]);

    expect(chunks).toEqual([{ text: "£" }]);
  });

  it("[DONE] ends the stream", async () => {
    const chunks = await collectChunks([
      'data: {"n":1}\n\ndata: [DONE]\n\ndata: {"n":2}\n\n',
    ]);

    expect(chunks).toEqual([{ n: 1 }]);
  });

  it("[DONE] cancels the body, so nothing keeps reading it", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller: ReadableStreamDefaultController<Uint8Array>): void {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
      cancel(): void {
        cancelled = true;
      },
    });

    await collectFrom(body, new AbortController().signal);

    expect(cancelled).toBe(true);
  });

  it("a malformed data line is skipped", async () => {
    const chunks = await collectChunks([
      'data: {"n":1}\n\ndata: {not json\n\ndata: {"n":2}\n\ndata: [DONE]\n\n',
    ]);

    expect(chunks).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("skips comment lines, the keep-alive OpenRouter sends", async () => {
    const chunks = await collectChunks([
      ": OPENROUTER PROCESSING\n\n",
      'data: {"n":1}\n\n',
      // A comment inside an event leaves the event's data whole.
      ': OPENROUTER PROCESSING\ndata: {"n":2}\n\n',
      ": OPENROUTER PROCESSING\n\ndata: [DONE]\n\n",
    ]);

    expect(chunks).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("reads a data field with no space after its colon, and ignores other fields", async () => {
    const chunks = await collectChunks([
      'event: message\nid: 7\ndata:{"n":1}\n\ndata: [DONE]\n\n',
    ]);

    expect(chunks).toEqual([{ n: 1 }]);
  });

  it("a stream that ends without [DONE] ends the iteration, last event included", async () => {
    const chunks = await collectChunks(['data: {"n":1}\n\ndata: {"n":2}']);

    expect(chunks).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("an abort mid-stream rejects the iteration, though the body never errors", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(stream: ReadableStreamDefaultController<Uint8Array>): void {
        stream.enqueue(new TextEncoder().encode('data: {"n":1}\n\n'));
        // Never closes: only the abort can end the read.
      },
    });
    const seen: unknown[] = [];

    const reading = (async (): Promise<void> => {
      for await (const chunk of parseSseChunks(body, controller.signal)) {
        seen.push(chunk);
        controller.abort();
      }
    })();

    await expect(reading).rejects.toThrow();
    expect(seen).toEqual([{ n: 1 }]);
  });

  it("an endless line fails the stream past the size cap, and cancels the body", async () => {
    const body = createRunawayBody("a".repeat(64 * 1024));

    await expect(
      collectFrom(body.stream, new AbortController().signal),
    ).rejects.toThrow(RangeError);
    expect(body.cancelled()).toBe(true);
    expect(body.pulledChars()).toBeLessThanOrEqual(SSE_CAP_CHARS * 2);
  });

  it("an endless event fails the stream past the size cap, and cancels the body", async () => {
    // Data lines that no blank line ever closes into an event.
    const body = createRunawayBody(`data: ${"a".repeat(1_000)}\n`.repeat(64));

    await expect(
      collectFrom(body.stream, new AbortController().signal),
    ).rejects.toThrow(RangeError);
    expect(body.cancelled()).toBe(true);
    expect(body.pulledChars()).toBeLessThanOrEqual(SSE_CAP_CHARS * 2);
  });

  it("a data line over the cap fails the stream even when it ends within one read", async () => {
    await expect(
      collectChunks([`data: "${"a".repeat(SSE_CAP_CHARS)}"\n\n`]),
    ).rejects.toThrow(RangeError);
  });

  it("a line just under the cap, in many small reads, parses in linear time", async () => {
    const value = "a".repeat(SSE_CAP_CHARS - 1_000);
    const text = `data: ${JSON.stringify(value)}\n\n`;
    const parts: string[] = [];

    for (let at = 0; at < text.length; at += 40) {
      parts.push(text.slice(at, at + 40));
    }

    // ~26,000 reads: rescanning the line so far on each one is ~1.3e10
    // character visits, far past the test's timeout.
    const chunks = await collectChunks(parts);

    expect(chunks).toEqual([value]);
  });

  it("an already aborted signal reads nothing", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      collectFrom(createBody(['data: {"n":1}\n\n']), controller.signal),
    ).rejects.toThrow();
  });
});

function createBody(parts: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return createByteBody(
    parts.map((part) => {
      return encoder.encode(part);
    }),
  );
}

function createByteBody(
  parts: readonly Uint8Array[],
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller: ReadableStreamDefaultController<Uint8Array>): void {
      for (const part of parts) {
        controller.enqueue(part);
      }

      controller.close();
    },
  });
}

async function collectFrom(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<unknown[]> {
  const chunks: unknown[] = [];

  for await (const chunk of parseSseChunks(body, signal)) {
    chunks.push(chunk);
  }

  return chunks;
}

function collectChunks(parts: readonly string[]): Promise<unknown[]> {
  return collectFrom(createBody(parts), new AbortController().signal);
}

function collectByteChunks(parts: readonly Uint8Array[]): Promise<unknown[]> {
  return collectFrom(createByteBody(parts), new AbortController().signal);
}

interface RunawayBody {
  readonly stream: ReadableStream<Uint8Array>;
  readonly cancelled: () => boolean;
  readonly pulledChars: () => number;
}

/** A body that repeats `piece` on every pull, up to 8 MiB, and records
 * whether the reader cancelled it. */
function createRunawayBody(piece: string): RunawayBody {
  const bytes = new TextEncoder().encode(piece);
  const limit = 8 * 1024 * 1024;
  let pulled = 0;
  let wasCancelled = false;

  return {
    stream: new ReadableStream<Uint8Array>({
      pull(controller: ReadableStreamDefaultController<Uint8Array>): void {
        if (pulled >= limit) {
          controller.close();

          return;
        }

        pulled += bytes.length;
        controller.enqueue(bytes);
      },
      cancel(): void {
        wasCancelled = true;
      },
    }),
    cancelled: (): boolean => {
      return wasCancelled;
    },
    pulledChars: (): number => {
      return pulled;
    },
  };
}

/** The parser's cap on one line, and on one event's data: 1 MiB. */
const SSE_CAP_CHARS = 1_048_576;
