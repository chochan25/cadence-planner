import OpenAI from "openai";
import { NextResponse } from "next/server";

import { fewShotExamples } from "@/data/few-shot-examples";
import { enforceRateLimit, readJsonWithLimit } from "@/lib/api-guard";
import {
  isFeedbackItem,
  isPlanResponseBody,
  type FeedbackItem,
} from "@/lib/plan";

const FEW_SHOT_MESSAGES = fewShotExamples.flatMap((ex) => [
  { role: "user" as const, content: ex.userState },
  { role: "assistant" as const, content: ex.recommendation },
]);

const SYSTEM_PROMPT =
  "You are a personal-state-aware planner that adapts schedules based on sleep debt, menstrual cycle phase, energy, and mental clarity. Ground recommendations in sleep science and chronobiology. Return JSON only.";

type BodyInput = {
  sleep?: unknown;
  energy?: unknown;
  clarity?: unknown;
  cyclePhase?: unknown;
  tasks?: unknown;
  feedback?: unknown;
};

const MAX_FEEDBACK_ITEMS = 50;
const MAX_TASK_CHARACTERS = 6_000;
const PLAN_MODELS = ["gpt-4.1-mini", "gpt-4o"] as const;

function formatFeedbackBlock(items: FeedbackItem[]): string {
  // Each line follows the prompt template the product asked for so the model
  // can latch onto the exact phrasing during in-context steering.
  const lines = items.map(
    (f) =>
      f.sentiment === "positive"
        ? `- User reported that "${f.task}" at ${f.time} worked well. Prefer similar placements when practical.`
        : `- User reported that "${f.task}" at ${f.time} did not work well. Avoid similar placements when practical.`,
  );
  return `Previous feedback:\n${lines.join("\n")}`;
}

function parseBoundedInt(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return {
      ok: false as const,
      error: `${label} must be an integer`,
    };
  }
  if (value < 1 || value > 10) {
    return {
      ok: false as const,
      error: `${label} must be between 1 and 10`,
    };
  }
  return { ok: true as const, value };
}

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    name: "plan",
    limit: 8,
    windowMs: 10 * 60 * 1_000,
  });
  if (limited) return limited;

  const parsedBody = await readJsonWithLimit(req, 16_384);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as BodyInput;

  const s = parseBoundedInt(body.sleep, "sleep");
  const e = parseBoundedInt(body.energy, "energy");
  const c = parseBoundedInt(body.clarity, "clarity");
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 });
  if (!e.ok) return NextResponse.json({ error: e.error }, { status: 400 });
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });

  if (typeof body.tasks !== "string") {
    return NextResponse.json(
      { error: "tasks must be a string" },
      { status: 400 },
    );
  }
  if (body.tasks.length > MAX_TASK_CHARACTERS) {
    return NextResponse.json(
      { error: `tasks may include at most ${MAX_TASK_CHARACTERS} characters` },
      { status: 400 },
    );
  }

  const cp = body.cyclePhase;
  if (
    cp !== null &&
    cp !== undefined &&
    typeof cp !== "string"
  ) {
    return NextResponse.json(
      { error: "cyclePhase must be a string or null" },
      { status: 400 },
    );
  }
  const cyclePhase = cp === undefined || cp === null ? null : cp;
  const cyclePhaseNormalized = cyclePhase?.trim().toLowerCase() ?? null;
  const isNoCycleTracking =
    cyclePhaseNormalized === "none" ||
    cyclePhaseNormalized === "n/a" ||
    cyclePhaseNormalized === "na";

  let feedback: FeedbackItem[] = [];
  if (body.feedback !== undefined && body.feedback !== null) {
    if (!Array.isArray(body.feedback)) {
      return NextResponse.json(
        { error: "feedback must be an array" },
        { status: 400 },
      );
    }
    if (body.feedback.length > MAX_FEEDBACK_ITEMS) {
      return NextResponse.json(
        { error: `feedback may include at most ${MAX_FEEDBACK_ITEMS} items` },
        { status: 400 },
      );
    }
    if (!body.feedback.every(isFeedbackItem)) {
      return NextResponse.json(
        { error: "feedback contains invalid items" },
        { status: 400 },
      );
    }
    feedback = body.feedback;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing OPENAI_API_KEY" },
      { status: 500 },
    );
  }

  const openai = new OpenAI({ apiKey });

  const stateBlock = [
    `Sleep quality (1-10): ${s.value}`,
    `Body energy (1-10): ${e.value}`,
    `Mental clarity (1-10): ${c.value}`,
    `Menstrual cycle phase: ${cyclePhase ?? "not specified"}`,
    "",
    "Today's tasks / intentions:",
    body.tasks.trim() || "(none provided)",
    ...(feedback.length > 0 ? ["", formatFeedbackBlock(feedback)] : []),
  ].join("\n");

  const userContent = `${stateBlock}

Respond with a single JSON object (no markdown) using exactly this shape:
{
  "schedule": [
    { "time": "string (clock or range, e.g. 9:00–10:30)", "task": "string", "type": "string (e.g. deep_work, admin, movement, meal, rest)", "duration": "string (human-readable, e.g. 45m)" }
  ],
  "rationale": "string explaining how sleep, energy, clarity, and cycle phase shaped the plan"
}`;
  const systemPrompt = isNoCycleTracking
    ? `${SYSTEM_PROMPT} This user does not track a menstrual cycle. Adapt based on sleep, energy, clarity, and chronotype only. Consider that testosterone peaks in the morning for most men, making early hours ideal for competitive or high-stakes tasks.`
    : SYSTEM_PROMPT;

  let completion;
  let requestError: unknown = null;
  try {
    for (let i = 0; i < PLAN_MODELS.length; i += 1) {
      const model = PLAN_MODELS[i];
      try {
        completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...FEW_SHOT_MESSAGES,
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        });
        requestError = null;
        break;
      } catch (err) {
        requestError = err;
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        const looksLikeMissingModel =
          message.includes("model") &&
          (message.includes("not found") ||
            message.includes("does not exist") ||
            message.includes("invalid"));
        const hasFallback = i < PLAN_MODELS.length - 1;
        if (!looksLikeMissingModel || !hasFallback) {
          throw err;
        }
      }
    }
  } catch (err) {
    console.error("Plan generation failed", requestError ?? err);
    return NextResponse.json(
      { error: "Plan generation is temporarily unavailable." },
      { status: 502 },
    );
  }

  if (!completion) {
    throw new Error("No completion");
  }
  const raw = completion.choices[0]?.message?.content ?? "";
  if (!raw.trim()) {
    return NextResponse.json(
      { error: "Model returned empty response" },
      { status: 502 },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Model returned invalid JSON" },
      { status: 502 },
    );
  }

  if (!isPlanResponseBody(parsed)) {
    return NextResponse.json(
      { error: "Model JSON did not match expected schedule shape" },
      { status: 502 },
    );
  }

  return NextResponse.json(parsed);
}
