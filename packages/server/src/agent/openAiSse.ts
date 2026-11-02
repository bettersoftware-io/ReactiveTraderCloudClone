/**
 * Reads an OpenAI-compatible streaming response: server-sent events whose
 * `data:` lines each carry one JSON chunk, ending `data: [DONE]`.
 *
 * Yields each event's data parsed as JSON. Skips comment lines (OpenRouter's
 * `: OPENROUTER PROCESSING` keep-alive) and fields other than `data`, and a
 * data line that is not JSON, rather than failing the stream on it. A line
 * split across reads, or a character split across them, is reassembled.
 * `[DONE]` ends the iteration and cancels the body; a body that closes
 * without it ends the iteration too, with any last event it carried. An
 * aborted `signal` cancels the read and rejects the iteration, whether or not
 * the body itself errors.
 */
export async function* parseSseChunks(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<unknown> {
  signal.throwIfAborted();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const splitter = createLineSplitter();
  // Data lines of the event being read; an event ends at a blank line.
  let dataLines: string[] = [];
  let dataChars = 0;
  let finished = false;

  function cancelRead(): void {
    reader.cancel().catch(() => {});
  }

  signal.addEventListener("abort", cancelRead, { once: true });

  try {
    while (!finished) {
      const { done, value } = await reader.read();

      signal.throwIfAborted();
      finished = done;

      const lines = splitter.take(
        done ? decoder.decode() : decoder.decode(value, { stream: true }),
      );

      // A body that ends mid-line, or mid-event, still delivers it.
      if (finished) {
        lines.push(...splitter.flush(), "");
      }

      for (const line of lines) {
        if (line === "") {
          const data = dataLines.join("\n");
          const hadData = dataLines.length > 0;
          dataLines = [];
          dataChars = 0;

          if (!hadData) {
            continue;
          }

          if (data === "[DONE]") {
            return;
          }

          const parsed = parseJson(data);

          if (parsed.ok) {
            yield parsed.value;
          }
        } else {
          // A comment line (`: keep-alive`) is a field with no name, so it
          // is skipped with the other fields that are not `data`.
          const value = dataFieldValue(line);

          if (value !== undefined) {
            dataChars += value.length + 1;

            if (dataChars > SSE_MAX_CHARS) {
              throw new RangeError("an event passed the size cap");
            }

            dataLines.push(value);
          }
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", cancelRead);

    if (!finished) {
      cancelRead();
    }
  }
}

/** The most characters one line, or one event's data, may hold: 1 MiB. A
 * provider's chunks run to a few hundred bytes; a stream past this is
 * broken, and reading on would only grow the server's memory. Past it the
 * stream fails, and the reader is cancelled. */
const SSE_MAX_CHARS = 1_048_576;

const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;

interface LineSplitter {
  /** The lines `text` completes. Each read's text is scanned once and the
   * unfinished end is kept as a piece, so a long line costs linear time. */
  take(text: string): string[];
  /** The unfinished last line, once the body has ended. */
  flush(): string[];
}

/** Splits a stream's text into lines, at `\n`, `\r\n` or a lone `\r`,
 * across reads. */
function createLineSplitter(): LineSplitter {
  let pieces: string[] = [];
  let pieceChars = 0;
  // The last character seen was a `\r`: a `\n` straight after it ends no
  // further line.
  let afterCarriageReturn = false;

  // A line finished within a read holds at most the capped pieces and that
  // read, so only the unfinished pieces need the cap.
  function finishLine(last: string): string {
    const line = pieces.length === 0 ? last : pieces.join("") + last;
    pieces = [];
    pieceChars = 0;

    return line;
  }

  return {
    take: (text: string): string[] => {
      const lines: string[] = [];
      let start = 0;

      for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);

        if (code === LINE_FEED && afterCarriageReturn) {
          afterCarriageReturn = false;
          start = i + 1;
          continue;
        }

        afterCarriageReturn = code === CARRIAGE_RETURN;

        if (code === LINE_FEED || code === CARRIAGE_RETURN) {
          lines.push(finishLine(text.slice(start, i)));
          start = i + 1;
        }
      }

      if (start < text.length) {
        pieceChars += text.length - start;

        if (pieceChars > SSE_MAX_CHARS) {
          throw new RangeError("a line passed the size cap");
        }

        pieces.push(text.slice(start));
      }

      return lines;
    },
    flush: (): string[] => {
      return pieceChars > 0 ? [finishLine("")] : [];
    },
  };
}

/** The value of a `data` field line, its one optional leading space taken
 * off; `undefined` for any other field. */
function dataFieldValue(line: string): string | undefined {
  const colon = line.indexOf(":");
  const field = colon < 0 ? line : line.slice(0, colon);

  if (field !== "data") {
    return undefined;
  }

  const value = colon < 0 ? "" : line.slice(colon + 1);

  return value.startsWith(" ") ? value.slice(1) : value;
}

type ParsedJson =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };

function parseJson(text: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
