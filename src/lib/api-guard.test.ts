import assert from "node:assert/strict";
import test from "node:test";

import { checkRateLimit } from "./rate-limit.ts";

test("blocks requests after the configured limit until reset", () => {
  const options = { name: `test-${crypto.randomUUID()}`, limit: 2, windowMs: 1_000 };
  assert.equal(checkRateLimit("visitor", options, 0).allowed, true);
  assert.equal(checkRateLimit("visitor", options, 1).allowed, true);
  const blocked = checkRateLimit("visitor", options, 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(checkRateLimit("visitor", options, 1_001).allowed, true);
});
