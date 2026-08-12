import { NextResponse } from "next/server";

import { enforceRateLimit, readJsonWithLimit } from "@/lib/api-guard";

const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`;
const TTS_MODEL_ID = "eleven_multilingual_v2";
const MAX_TEXT_CHARACTERS = 4_000;

function normalizeApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/^Bearer\s+/i, "").trim() || undefined;
}

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    name: "speak",
    limit: 12,
    windowMs: 10 * 60 * 1_000,
  });
  if (limited) return limited;

  const parsed = await readJsonWithLimit(req, 8_192);
  if (!parsed.ok) return parsed.response;

  if (
    !parsed.value ||
    typeof parsed.value !== "object" ||
    typeof (parsed.value as { text?: unknown }).text !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid text (must be string)" },
      { status: 400 },
    );
  }

  const text = (parsed.value as { text: string }).text.trim();
  if (!text) {
    return NextResponse.json({ error: "text must be non-empty" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARACTERS) {
    return NextResponse.json(
      { error: `text may include at most ${MAX_TEXT_CHARACTERS} characters` },
      { status: 400 },
    );
  }

  const apiKey = normalizeApiKey(
    process.env.ELEVENLABS_API_KEY ?? process.env.XI_API_KEY,
  );
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cloud voice is not configured for this demo." },
      { status: 503 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(ELEVENLABS_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: TTS_MODEL_ID }),
    });
  } catch {
    return NextResponse.json(
      { error: "Cloud voice is temporarily unavailable." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error:
          upstream.status === 401 || upstream.status === 403
            ? "Cloud voice is not configured correctly."
            : "Cloud voice is temporarily unavailable.",
      },
      { status: upstream.status >= 500 ? 502 : upstream.status },
    );
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
