const MAX_LINES = 120;
const lines: string[] = [];

/** Dev-only ring buffer for agent-visible NDJSON rows (no filesystem dependency). */
export function pushAgentDebugTailLine(ndjsonOneLine: string): void {
  const t = ndjsonOneLine.trim();
  if (!t) return;
  lines.push(t);
  while (lines.length > MAX_LINES) lines.shift();
}

export function getAgentDebugTailLines(): readonly string[] {
  return lines;
}

export function clearAgentDebugTail(): void {
  lines.length = 0;
}
