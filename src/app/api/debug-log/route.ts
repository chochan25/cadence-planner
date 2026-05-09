import { appendAgentDebugNdjsonNode } from "@/lib/agent-debug-log-node";
import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 12_288;

/** Persists NDJSON lines for Cursor debug sessions (client cannot write the log file directly). */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return NextResponse.json({ error: "JSON required" }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  if (!raw.trim().length || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body size rejected" }, { status: 400 });
  }

  let row: Record<string, unknown>;
  try {
    row = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  delete row.openai_api_key;
  delete row.apiKey;
  delete row.xi_api_key;
  const ts =
    typeof row.timestamp === "number" ? row.timestamp : Date.now();
  appendAgentDebugNdjsonNode({ ...row, timestamp: ts });

  return NextResponse.json({ ok: true });
}
