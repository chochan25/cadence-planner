const DEBUG_AGENT_INGEST_URL =
  "http://127.0.0.1:7242/ingest/b9342d9c-e889-4d29-929c-77f555273a1e";

/** Dual-write agent debug rows: Cursor ingest + dev-only NDJSON file via /api/debug-log. */
export function postAgentLog(row: Record<string, unknown>): void {
  const timestamp =
    typeof row.timestamp === "number" ? row.timestamp : Date.now();
  const body = JSON.stringify({ ...row, timestamp });

  fetch(DEBUG_AGENT_INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});

  if (typeof window !== "undefined") {
    fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }
}
