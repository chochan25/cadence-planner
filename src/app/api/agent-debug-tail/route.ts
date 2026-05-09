import {
  clearAgentDebugTail,
  getAgentDebugTailLines,
} from "@/lib/agent-debug-ring";
import { NextResponse } from "next/server";

/** Returns recent speak-pipeline debug NDJSON rows (dev-only); avoids missing `.cursor/debug.log`. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  return NextResponse.json({ lines: [...getAgentDebugTailLines()] });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  clearAgentDebugTail();
  return NextResponse.json({ ok: true });
}
