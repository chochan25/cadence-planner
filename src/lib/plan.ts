export type PlanScheduleItem = {
  time: string;
  task: string;
  type: string;
  duration: string;
};

export type PlanResponseBody = {
  schedule: PlanScheduleItem[];
  rationale: string;
};

export type FeedbackSentiment = "positive" | "negative";

export type FeedbackItem = {
  task: string;
  time: string;
  type: string;
  sentiment: FeedbackSentiment;
};

export function isFeedbackItem(data: unknown): data is FeedbackItem {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.task === "string" &&
    typeof o.time === "string" &&
    typeof o.type === "string" &&
    (o.sentiment === "positive" || o.sentiment === "negative")
  );
}

export function isPlanResponseBody(data: unknown): data is PlanResponseBody {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (typeof o.rationale !== "string") return false;
  return isPlanScheduleArray(o.schedule);
}

export function isPlanScheduleItem(data: unknown): data is PlanScheduleItem {
  if (!data || typeof data !== "object") return false;
  const s = data as Record<string, unknown>;
  return (
    typeof s.time === "string" &&
    typeof s.task === "string" &&
    typeof s.type === "string" &&
    typeof s.duration === "string"
  );
}

export function isPlanScheduleArray(data: unknown): data is PlanScheduleItem[] {
  return Array.isArray(data) && data.every(isPlanScheduleItem);
}
