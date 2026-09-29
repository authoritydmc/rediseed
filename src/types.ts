export type RedisStructure = "set" | "list" | "hash" | "string" | "zset";

export interface RedisConnectionOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

export interface SeedOptions extends RedisConnectionOptions {
  structure: RedisStructure;
  keyName?: string; // Static key or template e.g. "users:{{id}}" or "k6:tokens"
  column?: string; // Column/property to use when storing into set or list
  valueTemplate?: string; // Template for string or hash value e.g. "{{email}}:{{token}}"
  scoreColumn?: string; // Column for zset score
  batchSize?: number; // Pipeline batch size (default 1000)
  flushFirst?: boolean; // Delete key or matching pattern before seeding
  ttl?: number; // Key expiration in seconds (for string/hash)
  dryRun?: boolean; // Preview rows without inserting
}

export interface SeedResult {
  totalProcessed: number;
  totalInserted: number;
  elapsedMs: number;
  opsPerSec: number;
  structure: RedisStructure;
  keysAffected: number;
}

export interface ParsedRow {
  [key: string]: any;
}
