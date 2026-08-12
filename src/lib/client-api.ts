import {
  isPlanResponseBody,
  type FeedbackItem,
  type PlanResponseBody,
  type PlanScheduleItem,
} from "@/lib/plan";

export type PlanRequestPayload = {
  sleep: number;
  energy: number;
  clarity: number;
  cyclePhase: string | null;
  tasks: string;
  feedback?: FeedbackItem[];
};

export type MorningBriefPayload = PlanResponseBody & {
  createdAt: number;
  tasks: string;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

function errorFromPayload(payload: unknown, fallback: string): string {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback;
}

export async function fetchPlanFromApi(
  body: PlanRequestPayload,
): Promise<ApiResult<PlanResponseBody>> {
  try {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: errorFromPayload(payload, `Request failed (${response.status})`),
      };
    }
    return isPlanResponseBody(payload)
      ? { ok: true, data: payload }
      : { ok: false, error: "Unexpected response from server." };
  } catch {
    return {
      ok: false,
      error: "Network error. Check your connection and try again.",
    };
  }
}

export async function fetchMorningBriefPreview(
  body: MorningBriefPayload,
): Promise<ApiResult<{ subject: string; html: string }>> {
  try {
    const response = await fetch("/api/morning-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: errorFromPayload(payload, `Request failed (${response.status})`),
      };
    }
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "Unexpected response from server." };
    }
    const value = payload as { subject?: unknown; html?: unknown };
    return typeof value.subject === "string" && typeof value.html === "string"
      ? { ok: true, data: { subject: value.subject, html: value.html } }
      : { ok: false, error: "Unexpected response from server." };
  } catch {
    return {
      ok: false,
      error: "Network error. Check your connection and try again.",
    };
  }
}

export async function fetchRealtimeSession(): Promise<
  ApiResult<{ clientSecret: string; expiresAt: number | null; model: string }>
> {
  try {
    const response = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: errorFromPayload(
          payload,
          `Realtime session failed (${response.status})`,
        ),
      };
    }
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "Unexpected realtime session response." };
    }
    const value = payload as Record<string, unknown>;
    if (
      typeof value.clientSecret !== "string" ||
      (value.expiresAt !== null && typeof value.expiresAt !== "number") ||
      typeof value.model !== "string"
    ) {
      return { ok: false, error: "Unexpected realtime session response." };
    }
    return {
      ok: true,
      data: {
        clientSecret: value.clientSecret,
        expiresAt: value.expiresAt,
        model: value.model,
      },
    };
  } catch {
    return {
      ok: false,
      error: "Network error while starting voice check-in.",
    };
  }
}

export async function fetchCalendarExport(
  schedule: PlanScheduleItem[],
): Promise<ApiResult<{ fileContents: string; filename: string }>> {
  try {
    const response = await fetch("/api/export-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule }),
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      return {
        ok: false,
        error: errorFromPayload(payload, `Request failed (${response.status})`),
      };
    }
    const disposition = response.headers.get("Content-Disposition");
    const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);
    return {
      ok: true,
      data: {
        fileContents: await response.text(),
        filename: filenameMatch?.[1] ?? "planner-schedule.ics",
      },
    };
  } catch {
    return {
      ok: false,
      error: "Network error while exporting calendar. Please try again.",
    };
  }
}
