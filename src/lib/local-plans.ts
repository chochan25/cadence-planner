import type { FeedbackItem } from "@/lib/plan";

export const LOCAL_PLANS_KEY = "cadence.local-plans.v1";
export const MAX_LOCAL_PLANS = 50;

export type SavedScheduleItem = {
  time: string;
  task: string;
  type: string;
  duration: number;
};

export type SavedPlan = {
  id: string;
  createdAt: number;
  sleep: number;
  energy: number;
  clarity: number;
  cyclePhase: string;
  tasks: string;
  schedule: SavedScheduleItem[];
  rationale: string;
  feedback: FeedbackItem[];
};

function isFeedback(value: unknown): value is FeedbackItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.task === "string" &&
    typeof item.time === "string" &&
    typeof item.type === "string" &&
    (item.sentiment === "positive" || item.sentiment === "negative")
  );
}

function isSavedPlan(value: unknown): value is SavedPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return (
    typeof plan.id === "string" &&
    typeof plan.createdAt === "number" &&
    typeof plan.sleep === "number" &&
    typeof plan.energy === "number" &&
    typeof plan.clarity === "number" &&
    typeof plan.cyclePhase === "string" &&
    typeof plan.tasks === "string" &&
    typeof plan.rationale === "string" &&
    Array.isArray(plan.schedule) &&
    plan.schedule.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Record<string, unknown>;
      return (
        typeof item.time === "string" &&
        typeof item.task === "string" &&
        typeof item.type === "string" &&
        typeof item.duration === "number"
      );
    }) &&
    Array.isArray(plan.feedback) &&
    plan.feedback.every(isFeedback)
  );
}

export function readLocalPlans(raw: string | null): SavedPlan[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(isSavedPlan)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_LOCAL_PLANS);
  } catch {
    return [];
  }
}

export function recentFeedback(plans: SavedPlan[], limit = 25): FeedbackItem[] {
  const seen = new Set<string>();
  const result: FeedbackItem[] = [];

  for (const plan of plans) {
    for (const item of plan.feedback) {
      const key = `${item.time}::${item.task}::${item.sentiment}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
      if (result.length >= limit) return result;
    }
  }
  return result;
}
