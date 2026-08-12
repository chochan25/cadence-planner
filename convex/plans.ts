import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const scheduleItemValidator = v.object({
  time: v.string(),
  task: v.string(),
  type: v.string(),
  duration: v.number(),
});

const feedbackItemValidator = v.object({
  task: v.string(),
  time: v.string(),
  rating: v.number(),
});

/** Prototype-only storage. The public no-login demo keeps personal plans in-browser. */
export const savePlan = internalMutation({
  args: {
    createdAt: v.number(),
    sleep: v.number(),
    energy: v.number(),
    clarity: v.number(),
    cyclePhase: v.string(),
    tasks: v.string(),
    schedule: v.array(scheduleItemValidator),
    rationale: v.string(),
    feedback: v.optional(v.array(feedbackItemValidator)),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("plans", {
      createdAt: args.createdAt,
      sleep: args.sleep,
      energy: args.energy,
      clarity: args.clarity,
      cyclePhase: args.cyclePhase,
      tasks: args.tasks,
      schedule: args.schedule,
      rationale: args.rationale,
      feedback: args.feedback,
    });
  },
});

export const getRecentPlans = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", 0))
      .order("desc")
      .take(7);
  },
});

function toLocalTimestampDaysAgo(daysAgo: number, hour: number, minute = 0): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

export const seedDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoPlans = [
      {
        createdAt: toLocalTimestampDaysAgo(5, 8, 30),
        sleep: 3,
        energy: 2,
        clarity: 2,
        cyclePhase: "menstrual",
        tasks: "team standup, write PRD, dentist appointment, cook dinner",
        schedule: [
          { time: "8:30 AM", task: "Gentle breakfast + hydration", type: "rest", duration: 45 },
          { time: "9:30 AM", task: "Team standup", type: "meeting", duration: 30 },
          { time: "10:30 AM", task: "Recovery walk + tea", type: "rest", duration: 30 },
          { time: "11:30 AM", task: "Admin catch-up", type: "admin", duration: 45 },
          { time: "1:00 PM", task: "Dentist appointment", type: "errand", duration: 60 },
          { time: "2:15 PM", task: "Long rest block", type: "rest", duration: 60 },
          { time: "3:00 PM", task: "Write PRD (deep work sprint)", type: "deep_work", duration: 90 },
          { time: "5:30 PM", task: "Cook dinner", type: "personal", duration: 60 },
        ],
        rationale:
          "With significant sleep debt and menstrual-phase fatigue signals, this plan front-loads recovery and keeps one protected deep-work block at 3 PM when alertness can rebound after rest.",
      },
      {
        createdAt: toLocalTimestampDaysAgo(4, 8, 45),
        sleep: 4,
        energy: 3,
        clarity: 3,
        cyclePhase: "menstrual",
        tasks: "client presentation, expense reports, gym, grocery run",
        schedule: [
          { time: "8:45 AM", task: "Slow start + prep", type: "rest", duration: 45 },
          { time: "10:00 AM", task: "Client presentation prep", type: "admin", duration: 60 },
          { time: "11:15 AM", task: "Client presentation", type: "meeting", duration: 60 },
          { time: "1:00 PM", task: "Expense reports", type: "admin", duration: 60 },
          { time: "2:30 PM", task: "Focused follow-ups", type: "focus", duration: 60 },
          { time: "4:00 PM", task: "Gym", type: "personal", duration: 60 },
          { time: "6:00 PM", task: "Grocery run", type: "errand", duration: 60 },
        ],
        rationale:
          "Sleep debt remains elevated, so cognitive load stays lighter before noon; deep work is intentionally deferred to protect energy while menstrual-phase recovery is still in play.",
      },
      {
        createdAt: toLocalTimestampDaysAgo(3, 7, 50),
        sleep: 7,
        energy: 7,
        clarity: 8,
        cyclePhase: "follicular",
        tasks: "quarterly report, 1:1 with manager, code review, lunch with team",
        schedule: [
          { time: "9:00 AM", task: "Quarterly report drafting", type: "deep_work", duration: 120 },
          { time: "11:30 AM", task: "Code review", type: "focus", duration: 60 },
          { time: "1:00 PM", task: "Lunch with team", type: "meeting", duration: 60 },
          { time: "2:30 PM", task: "1:1 with manager", type: "meeting", duration: 45 },
          { time: "3:30 PM", task: "Report polish + send", type: "focus", duration: 60 },
        ],
        rationale:
          "Recovered sleep and follicular-phase momentum support earlier high-focus work, so the most analytical task is placed at 9 AM while social meetings stay later.",
      },
      {
        createdAt: toLocalTimestampDaysAgo(2, 7, 40),
        sleep: 8,
        energy: 8,
        clarity: 9,
        cyclePhase: "follicular",
        tasks: "product strategy doc, sprint planning, workout, meal prep",
        schedule: [
          { time: "8:00 AM", task: "Product strategy doc", type: "deep_work", duration: 120 },
          { time: "10:30 AM", task: "Sprint planning", type: "meeting", duration: 60 },
          { time: "12:00 PM", task: "Quick reset + lunch", type: "rest", duration: 45 },
          { time: "1:15 PM", task: "Strategy edits + next actions", type: "focus", duration: 75 },
          { time: "5:00 PM", task: "Workout", type: "personal", duration: 60 },
          { time: "6:30 PM", task: "Meal prep", type: "personal", duration: 60 },
        ],
        rationale:
          "Strong recovery and follicular-phase clarity make this an ideal early deep-work day; the 8 AM strategy block captures peak mental bandwidth before collaboration starts.",
      },
      {
        createdAt: toLocalTimestampDaysAgo(1, 8, 20),
        sleep: 5,
        energy: 5,
        clarity: 4,
        cyclePhase: "ovulatory",
        tasks: "stakeholder meeting, budget review, yoga, pick up kids",
        schedule: [
          { time: "9:00 AM", task: "Stakeholder meeting", type: "meeting", duration: 60 },
          { time: "10:30 AM", task: "Budget review with notes", type: "meeting", duration: 75 },
          { time: "1:00 PM", task: "Solo budget cleanup", type: "focus", duration: 90 },
          { time: "3:00 PM", task: "Async follow-ups", type: "admin", duration: 45 },
          { time: "5:00 PM", task: "Pick up kids", type: "personal", duration: 60 },
          { time: "7:00 PM", task: "Yoga", type: "rest", duration: 45 },
        ],
        rationale:
          "With moderate sleep debt but ovulatory social energy, meetings are grouped in the morning while lower-friction solo work is reserved for the afternoon to stabilize focus.",
      },
    ];

    const insertedIds = [];
    for (const plan of demoPlans) {
      const id = await ctx.db.insert("plans", plan);
      insertedIds.push(id);
    }
    return insertedIds;
  },
});
