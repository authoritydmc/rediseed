import { Redis, RedisOptions } from "ioredis";
import { RedisConnectionOptions } from "../types.js";

/**
 * Create a reusable ioredis client instance.
 */
export function createRedisClient(options: RedisConnectionOptions = {}): Redis {
  const url = options.url || process.env.REDIS_URL || process.env.REDIS_URI;

  if (url) {
    return new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  const redisConfig: RedisOptions = {
    host: options.host || process.env.REDIS_HOST || "127.0.0.1",
    port: options.port || (process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379),
    password: options.password || process.env.REDIS_PASSWORD || undefined,
    db: options.db !== undefined ? options.db : (process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0),
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  };

  if (options.tls) {
    redisConfig.tls = {};
  }

  return new Redis(redisConfig);
}
