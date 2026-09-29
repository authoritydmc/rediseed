import { Redis } from "ioredis";

export interface KeyInspection {
  key: string;
  type: string;
  count: number;
  memoryBytes?: number;
  ttl: number;
  samples: string[];
}

/**
 * Inspect a Redis key (count, type, memory, and sample items).
 */
export async function inspectKey(redis: Redis, key: string, sampleCount: number = 5): Promise<KeyInspection> {
  const [type, ttl] = await Promise.all([
    redis.type(key),
    redis.ttl(key),
  ]);

  let count = 0;
  let samples: string[] = [];

  switch (type) {
    case "set":
      count = await redis.scard(key);
      samples = await redis.srandmember(key, sampleCount) || [];
      break;

    case "list":
      count = await redis.llen(key);
      samples = await redis.lrange(key, 0, sampleCount - 1) || [];
      break;

    case "hash":
      count = await redis.hlen(key);
      const hashData = await redis.hgetall(key);
      samples = Object.entries(hashData).slice(0, sampleCount).map(([k, v]) => `${k}: ${v}`);
      break;

    case "zset":
      count = await redis.zcard(key);
      samples = await redis.zrange(key, 0, sampleCount - 1) || [];
      break;

    case "string":
      count = 1;
      const val = await redis.get(key);
      samples = val ? [val] : [];
      break;
  }

  let memoryBytes: number | undefined;
  try {
    const memory = await redis.memory("USAGE", key) as number;
    if (typeof memory === "number") memoryBytes = memory;
  } catch {
    // MEMORY USAGE might not be supported on all Redis clusters/proxies
  }

  return {
    key,
    type,
    count,
    memoryBytes,
    ttl,
    samples,
  };
}
