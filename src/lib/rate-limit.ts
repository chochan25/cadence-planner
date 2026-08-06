type RateBucket = { count: number; resetAt: number };

const globalWithBuckets = globalThis as typeof globalThis & {
  cadenceRateBuckets?: Map<string, RateBucket>;
};

const buckets =
  globalWithBuckets.cadenceRateBuckets ?? new Map<string, RateBucket>();
globalWithBuckets.cadenceRateBuckets = buckets;

const MAX_BUCKETS = 10_000;

function pruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  while (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

export type RateLimitOptions = {
  name: string;
  limit: number;
  windowMs: number;
};

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  pruneBuckets(now);
  const bucketKey = `${options.name}:${key}`;
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
