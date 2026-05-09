import { appendAgentDebugNdjsonNode } from "@/lib/agent-debug-log-node";
import { NextResponse } from "next/server";

const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
/** Query param recommended by ElevenLabs OpenAPI default (explicit mp3). */
const ELEVENLABS_STREAM_URL = `${ELEVENLABS_URL}?output_format=mp3_44100_128`;
/** ElevenLabs deprecated `eleven_monolingual_v1`; multilingual v2 covers English and matches current API defaults. */
const TTS_MODEL_ID = "eleven_multilingual_v2";

/** Fixes common .env mistakes: trailing newline, wrapping quotes, accidental Bearer prefix. */
function normalizeElevenLabsApiKey(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (/^Bearer\s+/i.test(s)) {
    s = s.replace(/^Bearer\s+/i, "").trim();
  }
  return s || undefined;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { text?: unknown }).text !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid text (must be string)" },
      { status: 400 },
    );
  }

  const text = ((body as { text: string }).text ?? "").trim();
  if (!text) {
    return NextResponse.json(
      { error: "text must be non-empty" },
      { status: 400 },
    );
  }

  const rawKey =
    process.env.ELEVENLABS_API_KEY ?? process.env.XI_API_KEY ?? undefined;
  const apiKey = normalizeElevenLabsApiKey(rawKey);
  const keyHadEdgeWhitespace =
    typeof rawKey === "string" && rawKey.length > 0 && rawKey !== rawKey.trim();
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/b9342d9c-e889-4d29-929c-77f555273a1e", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hypothesisId: "H_SERVER_KEY",
      location: "api/speak/route.ts:POST",
      message: "speak POST received",
      data: {
        textLen: text.length,
        hasElevenLabsKey: Boolean(apiKey?.length),
        keyHadEdgeWhitespace,
        usedXiApiKeyFallback: Boolean(
          !normalizeElevenLabsApiKey(process.env.ELEVENLABS_API_KEY) &&
            normalizeElevenLabsApiKey(process.env.XI_API_KEY),
        ),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  appendAgentDebugNdjsonNode({
    hypothesisId: "H_SERVER_KEY",
    location: "api/speak/route.ts",
    textLen: text.length,
    hasElevenLabsKey: Boolean(apiKey?.length),
    keyHadEdgeWhitespace,
  });
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Server is missing a valid ELEVENLABS_API_KEY (or XI_API_KEY fallback)",
      },
      { status: 500 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(ELEVENLABS_STREAM_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg, application/octet-stream;q=0.9, */*;q=0.8",
      },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL_ID,
      }),
    });
  } catch {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b9342d9c-e889-4d29-929c-77f555273a1e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hypothesisId: "H_UPSTREAM_ELAB",
        location: "api/speak/route.ts:POST",
        message: "fetch to ElevenLabs threw",
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json(
      { error: "Failed to reach ElevenLabs API" },
      { status: 502 },
    );
  }

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/b9342d9c-e889-4d29-929c-77f555273a1e", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hypothesisId: "H_UPSTREAM_ELAB",
      location: "api/speak/route.ts:POST",
      message: "ElevenLabs response headers",
      data: {
        ok: upstream.ok,
        status: upstream.status,
        ct: upstream.headers.get("content-type") ?? "",
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  appendAgentDebugNdjsonNode({
    hypothesisId: "H_UPSTREAM_ELAB",
    location: "api/speak/route.ts",
    upstreamOk: upstream.ok,
    upstreamStatus: upstream.status,
    upstreamCt: upstream.headers.get("content-type") ?? "",
    modelId: TTS_MODEL_ID,
  });

  if (!upstream.ok) {
    const errSnippet = await upstream.text().catch(() => "");
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b9342d9c-e889-4d29-929c-77f555273a1e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hypothesisId: "H_UPSTREAM_ELAB",
        location: "api/speak/route.ts:POST",
        message: "ElevenLabs error body prefix",
        data: {
          status: upstream.status,
          detailPrefix: errSnippet.slice(0, 300),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    appendAgentDebugNdjsonNode({
      hypothesisId: "H_UPSTREAM_ELAB_ERR",
      location: "api/speak/route.ts",
      status: upstream.status,
      detailPrefix: errSnippet.slice(0, 400),
    });
    const unauthorized =
      upstream.status === 401 || upstream.status === 403;
    return NextResponse.json(
      {
        error: unauthorized
          ? "ElevenLabs API key rejected — set a valid ELEVENLABS_API_KEY (or XI_API_KEY) in .env.local and restart the dev server."
          : "ElevenLabs request failed",
        detail:
          errSnippet.slice(0, 500) || `HTTP ${upstream.status}`,
      },
      { status: upstream.status },
    );
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/b9342d9c-e889-4d29-929c-77f555273a1e", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hypothesisId: "H_SERVER_AUDIO",
      location: "api/speak/route.ts:POST",
      message: "returning MPEG buffer to client",
      data: { byteLength: buffer.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  appendAgentDebugNdjsonNode({
    hypothesisId: "H_SERVER_AUDIO",
    location: "api/speak/route.ts",
    byteLength: buffer.length,
  });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
    },
  });
}
