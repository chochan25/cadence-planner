import { NextResponse } from "next/server";

import { enforceRateLimit, readJsonWithLimit } from "@/lib/api-guard";
import { isPlanResponseBody, type PlanScheduleItem } from "@/lib/plan";

type MorningBriefPlan = {
  createdAt: number;
  tasks: string;
  schedule: PlanScheduleItem[];
  rationale: string;
};

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMorningBriefHtml(plan: MorningBriefPlan) {
  const createdAt = new Date(plan.createdAt).toLocaleString();
  const rows = plan.schedule
    .map(
      (item) => `<tr>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:14px;color:#111827;white-space:nowrap;">${escapeHtml(item.time)}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:14px;color:#111827;">${escapeHtml(item.task)}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:13px;color:#334155;text-transform:capitalize;">${escapeHtml(item.type.replaceAll("_", " "))}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:13px;color:#334155;white-space:nowrap;">${escapeHtml(item.duration)}</td>
</tr>`,
    )
    .join("\n");

  const rationaleHtml = escapeHtml(plan.rationale).replaceAll("\n", "<br/>");
  const taskSummaryHtml = escapeHtml(plan.tasks).replaceAll("\n", "<br/>");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
    <div style="max-width:720px;margin:24px auto;padding:0 16px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <div style="padding:24px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Morning Brief</p>
          <h1 style="margin:0;font-size:24px;line-height:1.2;color:#0f172a;">Today's Plan</h1>
          <p style="margin:10px 0 0;font-size:13px;color:#475569;">Generated from your latest check-in on ${escapeHtml(createdAt)}</p>
        </div>

        <div style="padding:24px;">
          <h2 style="margin:0 0 10px;font-size:16px;color:#0f172a;">Schedule</h2>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="text-align:left;padding:10px 12px;border:1px solid #e5e7eb;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">Time</th>
                <th style="text-align:left;padding:10px 12px;border:1px solid #e5e7eb;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">Task</th>
                <th style="text-align:left;padding:10px 12px;border:1px solid #e5e7eb;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">Type</th>
                <th style="text-align:left;padding:10px 12px;border:1px solid #e5e7eb;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">Duration</th>
              </tr>
            </thead>
            <tbody>
${rows}
            </tbody>
          </table>

          <h2 style="margin:24px 0 10px;font-size:16px;color:#0f172a;">Rationale</h2>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#1e293b;">${rationaleHtml}</p>

          <h2 style="margin:24px 0 10px;font-size:16px;color:#0f172a;">Task Input Snapshot</h2>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#1e293b;">${taskSummaryHtml || "<em>(none provided)</em>"}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    name: "morning-brief",
    limit: 30,
    windowMs: 10 * 60 * 1_000,
  });
  if (limited) return limited;

  const parsed = await readJsonWithLimit(req, 32_768);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { createdAt?: unknown }).createdAt !== "number" ||
    typeof (body as { tasks?: unknown }).tasks !== "string" ||
    !isPlanResponseBody(body)
  ) {
    return NextResponse.json(
      { error: "Morning brief payload is invalid." },
      { status: 400 },
    );
  }

  const latestPlan = body as MorningBriefPlan;

  return NextResponse.json({
    subject: "Your Morning Brief",
    html: buildMorningBriefHtml(latestPlan),
  });
}
