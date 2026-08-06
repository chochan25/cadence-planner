import { NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/api-guard";

export const runtime = "nodejs";

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";

const CHECKIN_INSTRUCTIONS = `
You extract a daily planning check-in from the user's spoken input.
Call set_checkin_inputs once after the user finishes speaking.
Only include fields the user stated or clearly implied.
Use 1-10 integers for sleep, energy, and clarity.
Use one of menstrual, follicular, ovulatory, luteal, or none for cyclePhase.
Put all tasks and commitments into one concise plain-text tasks field.
Do not generate a schedule or plan.
`.trim();

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    name: "realtime-session",
    limit: 6,
    windowMs: 10 * 60 * 1_000,
  });
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing OPENAI_API_KEY" },
      { status: 500 },
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 600,
        },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: CHECKIN_INSTRUCTIONS,
          output_modalities: ["text"],
          max_output_tokens: 512,
          audio: {
            input: {
              noise_reduction: {
                type: "near_field",
              },
              turn_detection: {
                type: "server_vad",
                create_response: false,
                prefix_padding_ms: 300,
                silence_duration_ms: 900,
              },
            },
          },
          tool_choice: {
            type: "function",
            name: "set_checkin_inputs",
          },
          tools: [
            {
              type: "function",
              name: "set_checkin_inputs",
              description:
                "Fill the Cadence daily check-in form from the user's spoken check-in.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  sleep: {
                    type: "integer",
                    minimum: 1,
                    maximum: 10,
                    description:
                      "Sleep quality or restfulness on a 1-10 scale.",
                  },
                  energy: {
                    type: "integer",
                    minimum: 1,
                    maximum: 10,
                    description: "Body energy on a 1-10 scale.",
                  },
                  clarity: {
                    type: "integer",
                    minimum: 1,
                    maximum: 10,
                    description: "Mental clarity or focus on a 1-10 scale.",
                  },
                  cyclePhase: {
                    type: "string",
                    enum: [
                      "menstrual",
                      "follicular",
                      "ovulatory",
                      "luteal",
                      "none",
                    ],
                    description:
                      "Current menstrual cycle phase, or none if not applicable.",
                  },
                  tasks: {
                    type: "string",
                    description:
                      "Today's tasks, commitments, and intentions as concise plain text.",
                  },
                },
              },
            },
          ],
        },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Voice check-in is temporarily unavailable." },
      { status: 502 },
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: { message?: unknown } }).error?.message ===
        "string"
        ? (payload as { error: { message: string } }).error.message
        : `Realtime session request failed (${response.status})`;

    console.error("Realtime session request failed", message);
    return NextResponse.json(
      { error: "Voice check-in is temporarily unavailable." },
      { status: 502 },
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("value" in payload) ||
    typeof (payload as { value: unknown }).value !== "string"
  ) {
    return NextResponse.json(
      { error: "Realtime session response did not include a client secret." },
      { status: 502 },
    );
  }

  const data = payload as {
    value: string;
    expires_at?: number;
    session?: { model?: string };
  };

  return NextResponse.json({
    clientSecret: data.value,
    expiresAt: data.expires_at ?? null,
    model: data.session?.model ?? REALTIME_MODEL,
  });
}
