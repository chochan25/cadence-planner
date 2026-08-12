import assert from "node:assert/strict";
import test from "node:test";

import { readLocalPlans, recentFeedback, type SavedPlan } from "./local-plans.ts";

const plan: SavedPlan = {
  id: "plan-1",
  createdAt: 10,
  sleep: 7,
  energy: 8,
  clarity: 9,
  cyclePhase: "none",
  tasks: "Write tests",
  schedule: [{ time: "9:00", task: "Write tests", type: "focus", duration: 60 }],
  rationale: "A focused morning.",
  feedback: [
    {
      time: "9:00",
      task: "Write tests",
      type: "focus",
      sentiment: "positive",
    },
  ],
};

test("reads valid browser plans and rejects malformed storage", () => {
  assert.deepEqual(readLocalPlans(JSON.stringify([plan])), [plan]);
  assert.deepEqual(readLocalPlans("not-json"), []);
  assert.deepEqual(readLocalPlans(JSON.stringify([{ id: "broken" }])), []);
});

test("returns recent unique feedback", () => {
  assert.deepEqual(recentFeedback([plan, plan]), plan.feedback);
});
