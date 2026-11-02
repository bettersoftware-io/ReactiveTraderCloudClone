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
  // Data lines of the event being read; an event ends at a blank line.
  let dataLines: string[] = [];
  let pending = "";
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
      pending += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });

      const { lines, rest } = splitLines(pending, finished);
      pending = rest;

      if (finished && rest.length > 0) {
        lines.push(rest);
        pending = "";
      }

      // A body that ends mid-event still delivers that event.
      if (finished) {
        lines.push("");
      }

      for (const line of lines) {
        if (line === "") {
          const data = dataLines.join("\n");
          const hadData = dataLines.length > 0;
          dataLines = [];

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

interface SplitLines {
  readonly lines: string[];
  readonly rest: string;
}

/** Splits off every complete line, at `\n`, `\r\n` or a lone `\r`. A `\r` at
 * the very end waits for the next read unless the body is finished: the
 * `\n` that would pair with it may be in that read. */
function splitLines(text: string, finished: boolean): SplitLines {
  const lines: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === "\n") {
      lines.push(text.slice(start, i));
      start = i + 1;
    } else if (char === "\r") {
      if (i + 1 === text.length && !finished) {
        break;
      }

      lines.push(text.slice(start, i));

      if (text[i + 1] === "\n") {
        i += 1;
      }

      start = i + 1;
    }
  }

  return { lines, rest: text.slice(start) };
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
