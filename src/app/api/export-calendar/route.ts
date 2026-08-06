import { createEvents, type EventAttributes } from "ics";
import { NextResponse } from "next/server";

import { readJsonWithLimit } from "@/lib/api-guard";
import { isPlanScheduleArray, type PlanScheduleItem } from "@/lib/plan";

type ExportCalendarBody = {
  schedule?: unknown;
};

function parseDurationToMinutes(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  let minutes = 0;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hourMatch) {
    minutes += Math.round(Number.parseFloat(hourMatch[1]) * 60);
  }
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (minuteMatch) {
    minutes += Math.round(Number.parseFloat(minuteMatch[1]));
  }

  if (minutes > 0) return minutes;

  const fallbackNumber = text.match(/(\d+(?:\.\d+)?)/);
  if (!fallbackNumber) return null;
  const raw = Number.parseFloat(fallbackNumber[1]);
  if (!Number.isFinite(raw) || raw <= 0) return null;

  // If no explicit unit exists, treat larger values as minutes and small
  // values (<= 12) as hours, because model output often uses "2" for 2h.
  if (!/[hm]/.test(text) && raw <= 12) return Math.round(raw * 60);
  return Math.round(raw);
}

function parseStartMinutes(timeLabel: string): number | null {
  const normalized = timeLabel.replace(/[–—]/g, "-");
  const match = normalized.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );
  if (!match) return null;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2] ?? "0", 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const ampm = match[3]?.toLowerCase();
  if (ampm) {
    const normalizedHour = hour % 12;
    const hour24 = ampm === "pm" ? normalizedHour + 12 : normalizedHour;
    return hour24 * 60 + minute;
  }
  return hour * 60 + minute;
}

function buildEventForToday(item: PlanScheduleItem): EventAttributes | null {
  const startMinutes = parseStartMinutes(item.time);
  if (startMinutes == null) return null;

  const durationMinutes = parseDurationToMinutes(item.duration) ?? 30;
  const today = new Date();
  const startHour = Math.floor(startMinutes / 60);
  const startMinute = startMinutes % 60;

  return {
    title: item.task,
    description: `Type: ${item.type}\nOriginal slot: ${item.time}\nPlanned duration: ${item.duration}`,
    categories: [item.type],
    start: [
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate(),
      startHour,
      startMinute,
    ],
    duration: { minutes: Math.max(durationMinutes, 1) },
    busyStatus: "BUSY",
    startInputType: "local",
    startOutputType: "local",
  };
}

export async function POST(req: Request) {
  const parsedBody = await readJsonWithLimit(req, 32_768);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as ExportCalendarBody;

  if (!isPlanScheduleArray(body.schedule)) {
    return NextResponse.json(
      { error: "schedule must be an array of plan items" },
      { status: 400 },
    );
  }

  if (body.schedule.length === 0) {
    return NextResponse.json(
      { error: "schedule cannot be empty" },
      { status: 400 },
    );
  }

  const events = body.schedule
    .map(buildEventForToday)
    .filter((event): event is EventAttributes => event !== null);

  if (events.length === 0) {
    return NextResponse.json(
      { error: "Could not parse any schedule times into calendar events" },
      { status: 400 },
    );
  }

  const generated = createEvents(events);
  if (generated.error || !generated.value) {
    return NextResponse.json(
      { error: generated.error?.message ?? "Failed to generate calendar file" },
      { status: 500 },
    );
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(generated.value, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="planner-schedule-${dateStamp}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
