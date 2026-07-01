// PROTO 1159 (exportCsv): quote every field, doubling embedded quotes, join
// cells with commas and rows with newlines; then trigger a same-origin Blob
// download via a throwaway anchor. The download step is best-effort (the
// prototype wraps it in try/catch) and is guarded here for jsdom, which has
// `document` and `URL` but does not implement `URL.createObjectURL`.
const CSV_MIME = "text/csv";
const REVOKE_DELAY_MS = 1000;

function escapeCsvField(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => {
    return row.map(escapeCsvField).join(",");
  });

  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }

  try {
    const blob = new Blob([csv], { type: CSV_MIME });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(anchor.href);
    }, REVOKE_DELAY_MS);
  } catch {
    // Best-effort export — mirrors PROTO's swallowed catch(e){}.
  }
}
