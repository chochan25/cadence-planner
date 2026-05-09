/** Maps schedule item `type` to Tailwind accents for timeline rows. */

export type TimelineAccent = {
  bar: string;
  surface: string;
  pill: string;
};

export function timelineAccent(type: string): TimelineAccent {
  const t = type.toLowerCase();

  if (/deep|focus|study|strategy|coding|writing|creative|builder|research/.test(t)) {
    return {
      bar: "bg-sky-500",
      surface: "border-sky-500/40 bg-sky-500/[0.09]",
      pill:
        "bg-sky-500/18 text-sky-950 ring-1 ring-sky-500/35 dark:text-sky-50",
    };
  }

  if (/admin|email|inbox|errand|bill|finance|shallow|chore/.test(t)) {
    return {
      bar: "bg-slate-500",
      surface: "border-slate-500/35 bg-slate-500/[0.08]",
      pill:
        "bg-slate-500/14 text-slate-900 ring-1 ring-slate-500/35 dark:text-slate-100",
    };
  }

  if (/move|walk|run|train|workout|gym|stretch|exercise/.test(t)) {
    return {
      bar: "bg-emerald-500",
      surface: "border-emerald-500/40 bg-emerald-500/[0.09]",
      pill:
        "bg-emerald-500/18 text-emerald-950 ring-1 ring-emerald-500/35 dark:text-emerald-50",
    };
  }

  if (/meal|eat|food|breakfast|lunch|dinner|snack|coffee/.test(t)) {
    return {
      bar: "bg-amber-500",
      surface: "border-amber-500/35 bg-amber-500/[0.09]",
      pill:
        "bg-amber-500/18 text-amber-950 ring-1 ring-amber-500/35 dark:text-amber-50",
    };
  }

  if (/rest|recovery|sleep|nap|wind|relax|mindful|cooldown/.test(t)) {
    return {
      bar: "bg-violet-500",
      surface: "border-violet-500/35 bg-violet-500/[0.08]",
      pill:
        "bg-violet-500/18 text-violet-950 ring-1 ring-violet-500/35 dark:text-violet-50",
    };
  }

  if (/meet|social|call|sync|partner|fam/.test(t)) {
    return {
      bar: "bg-rose-500",
      surface: "border-rose-500/35 bg-rose-500/[0.08]",
      pill:
        "bg-rose-500/17 text-rose-950 ring-1 ring-rose-500/35 dark:text-rose-50",
    };
  }

  if (/travel|commute|transition|buffer/.test(t)) {
    return {
      bar: "bg-cyan-500",
      surface: "border-cyan-500/35 bg-cyan-500/[0.08]",
      pill:
        "bg-cyan-500/17 text-cyan-950 ring-1 ring-cyan-500/35 dark:text-cyan-50",
    };
  }

  return {
    bar: "bg-primary",
    surface: "border-border bg-muted/50",
    pill: "bg-secondary text-secondary-foreground ring-1 ring-border",
  };
}
