import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  plans: defineTable({
    createdAt: v.number(),
    sleep: v.number(),
    energy: v.number(),
    clarity: v.number(),
    cyclePhase: v.string(),
    tasks: v.string(),
    schedule: v.array(
      v.object({
        time: v.string(),
        task: v.string(),
        type: v.string(),
        duration: v.number(),
      }),
    ),
    rationale: v.string(),
    feedback: v.optional(
      v.array(
        v.object({
          task: v.string(),
          time: v.string(),
          rating: v.number(),
        }),
      ),
    ),
  }).index("by_createdAt", ["createdAt"]),
});
