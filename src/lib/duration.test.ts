import assert from "node:assert/strict";
import test from "node:test";

import { durationLabelToMinutes } from "./duration.ts";

test("converts common human-readable durations to minutes", () => {
  assert.equal(durationLabelToMinutes("45m"), 45);
  assert.equal(durationLabelToMinutes("1h"), 60);
  assert.equal(durationLabelToMinutes("1.5 hours"), 90);
  assert.equal(durationLabelToMinutes("1h 30m"), 90);
  assert.equal(durationLabelToMinutes("30 minutes"), 30);
});

test("handles plain and invalid duration values", () => {
  assert.equal(durationLabelToMinutes("45"), 45);
  assert.equal(durationLabelToMinutes("unknown"), 0);
  assert.equal(durationLabelToMinutes(""), 0);
});
