import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMorningBriefHtml(plan: Doc<"plans">) {
  const createdAt = new Date(plan.createdAt).toLocaleString();
  const rows = plan.schedule
    .map(
      (item) => `<tr>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:14px;color:#111827;white-space:nowrap;">${escapeHtml(item.time)}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:14px;color:#111827;">${escapeHtml(item.task)}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:13px;color:#334155;text-transform:capitalize;">${escapeHtml(item.type.replaceAll("_", " "))}</td>
  <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:13px;color:#334155;white-space:nowrap;">${escapeHtml(String(item.duration))} min</td>
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

export async function GET() {
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? "";
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Server is missing NEXT_PUBLIC_CONVEX_URL (or CONVEX_URL)." },
      { status: 500 },
    );
  }

  const client = new ConvexHttpClient(convexUrl);
  const recentPlans = await client.query(api.plans.getRecentPlans, {});
  const latestPlan = recentPlans[0];
  if (!latestPlan) {
    return NextResponse.json(
      { error: "No saved plan found yet. Generate and save a plan first." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    subject: "Your Morning Brief",
    html: buildMorningBriefHtml(latestPlan),
  });
}
