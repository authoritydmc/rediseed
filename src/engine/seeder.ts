import { Redis } from "ioredis";
import { SeedOptions, SeedResult, ParsedRow } from "../types.js";
import { renderTemplate, extractRowValue } from "../utils/template.js";

/**
 * Execute high-speed batched seeding into Redis using pipelines.
 */
export async function executeSeed(
  redis: Redis,
  rows: ParsedRow[],
  options: SeedOptions
): Promise<SeedResult> {
  const startTime = Date.now();
  const batchSize = options.batchSize || 1000;
  let totalInserted = 0;
  const uniqueKeys = new Set<string>();

  // If flushFirst is enabled and static keyName is provided, delete it first
  if (options.flushFirst && options.keyName && !options.keyName.includes("{{")) {
    await redis.del(options.keyName);
  }

  // Process in batches using pipeline
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const pipeline = redis.pipeline();

    for (const row of batch) {
      const targetKey = options.keyName
        ? renderTemplate(options.keyName, row)
        : "seed:data";

      uniqueKeys.add(targetKey);
      const val = extractRowValue(row, options.column, options.valueTemplate);

      switch (options.structure) {
        case "set":
          pipeline.sadd(targetKey, val);
          break;

        case "list":
          pipeline.rpush(targetKey, val);
          break;

        case "string":
          if (options.ttl) {
            pipeline.set(targetKey, val, "EX", options.ttl);
          } else {
            pipeline.set(targetKey, val);
          }
          break;

        case "hash":
          // If row has multiple columns, store full hash fields
          const hashFields: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) {
            hashFields[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
          }
          pipeline.hset(targetKey, hashFields);
          if (options.ttl) {
            pipeline.expire(targetKey, options.ttl);
          }
          break;

        case "zset":
          const score = options.scoreColumn && row[options.scoreColumn] !== undefined
            ? parseFloat(row[options.scoreColumn]) || 0
            : Date.now();
          pipeline.zadd(targetKey, score, val);
          break;
      }
    }

    await pipeline.exec();
    totalInserted += batch.length;
  }

  const elapsedMs = Math.max(1, Date.now() - startTime);
  const opsPerSec = Math.round((totalInserted / elapsedMs) * 1000);

  return {
    totalProcessed: rows.length,
    totalInserted,
    elapsedMs,
    opsPerSec,
    structure: options.structure,
    keysAffected: uniqueKeys.size,
  };
}
