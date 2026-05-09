import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { pushAgentDebugTailLine } from "@/lib/agent-debug-ring";

/** Writable when tooling blocks `.cursor/debug.log`; dev-only mirror. */
const FALLBACK_AGENT_LOG = "debug.agent.ndjson";

function shouldMirrorSpeakDebugToStdout(hypothesisId: string): boolean {
  return (
    hypothesisId.startsWith("H_CLIENT") ||
    hypothesisId.startsWith("H_SYNTH") ||
    hypothesisId.startsWith("H_SYNC_PLAY") ||
    hypothesisId.startsWith("H_UPSTREAM_ELAB") ||
    hypothesisId === "H_SERVER_KEY" ||
    hypothesisId === "H_SERVER_AUDIO" ||
    hypothesisId === "H_AUDIO_REJECT" ||
    hypothesisId === "H_PLAY_GATE" ||
    hypothesisId === "H_BLOB_INVALID"
  );
}

export function appendAgentDebugNdjsonNode(row: Record<string, unknown>) {
  const ts =
    typeof row.timestamp === "number" ? row.timestamp : Date.now();
  const cwd = process.cwd();
  const dev = process.env.NODE_ENV !== "production";
  const enriched: Record<string, unknown> = dev
    ? { ...row, timestamp: ts, nodeCwd: cwd }
    : { ...row, timestamp: ts };
  const line = `${JSON.stringify(enriched)}\n`;

  try {
    const dir = join(cwd, ".cursor");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "debug.log"), line);
  } catch {
    /* continue to fallback */
  }
  if (dev) {
    try {
      appendFileSync(join(cwd, FALLBACK_AGENT_LOG), line);
    } catch {
      /* noop */
    }
    const hid =
      typeof enriched.hypothesisId === "string"
        ? enriched.hypothesisId
        : "";
    if (hid && shouldMirrorSpeakDebugToStdout(hid)) {
      const trimmed = line.trim();
      console.info(`[agent-debug] ${trimmed}`);
      pushAgentDebugTailLine(trimmed);
    }
  }
}
