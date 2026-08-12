import { NextResponse } from "next/server";

import { checkRateLimit, type RateLimitOptions } from "@/lib/rate-limit";

function requestKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function enforceRateLimit(
  req: Request,
  options: RateLimitOptions,
): NextResponse | null {
  const result = checkRateLimit(requestKey(req), options);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Too many requests. Please wait before trying again." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}

export async function readJsonWithLimit(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse }
> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body is too large." },
        { status: 413 },
      ),
    };
  }

  let raw = "";
  try {
    if (req.body) {
      const reader = req.body.getReader();
      const decoder = new TextDecoder();
      let bytesRead = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel();
          return {
            ok: false,
            response: NextResponse.json(
              { error: "Request body is too large." },
              { status: 413 },
            ),
          };
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not read request body." },
        { status: 400 },
      ),
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
}
