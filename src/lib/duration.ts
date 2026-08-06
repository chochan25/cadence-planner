/** Converts planner duration labels such as "45m" or "1h 30m" to minutes. */
export function durationLabelToMinutes(input: string): number {
  const text = input.trim().toLowerCase();
  if (!text) return 0;

  let minutes = 0;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const mins = text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);

  if (hours) minutes += Number.parseFloat(hours[1]) * 60;
  if (mins) minutes += Number.parseFloat(mins[1]);
  if (minutes > 0 && Number.isFinite(minutes)) return Math.round(minutes);

  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}
