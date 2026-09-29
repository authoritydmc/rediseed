import { Redis } from 'ioredis';

type RedisStructure = "set" | "list" | "hash" | "string" | "zset";
interface RedisConnectionOptions {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    tls?: boolean;
}
interface SeedOptions extends RedisConnectionOptions {
    structure: RedisStructure;
    keyName?: string;
    column?: string;
    valueTemplate?: string;
    scoreColumn?: string;
    batchSize?: number;
    flushFirst?: boolean;
    ttl?: number;
    dryRun?: boolean;
}
interface SeedResult {
    totalProcessed: number;
    totalInserted: number;
    elapsedMs: number;
    opsPerSec: number;
    structure: RedisStructure;
    keysAffected: number;
}
interface ParsedRow {
    [key: string]: any;
}

/**
 * Parse a CSV string or file content into array of row objects.
 */
declare function parseCSV(content: string, delimiter?: string): ParsedRow[];
/**
 * Parse a JSON array, single JSON object, or JSONL string into array of row objects.
 */
declare function parseJSONOrJSONL(content: string): ParsedRow[];
/**
 * Parse plain text lines into { value: line } rows.
 */
declare function parseLines(content: string): ParsedRow[];
/**
 * Auto-detect file format from extension and contents.
 */
declare function loadAndParseFile(filePath: string): ParsedRow[];

/**
 * Render template string replacing `{{variable}}` with values from row.
 */
declare function renderTemplate(template: string, row: ParsedRow): string;
/**
 * Extract item value from row based on column or template.
 */
declare function extractRowValue(row: ParsedRow, column?: string, valueTemplate?: string): string;

/**
 * Generate ready-to-use k6 test script snippets using xk6-redis or HTTP mocks.
 */
declare function generateK6Snippet(keyName: string, structure: RedisStructure): string;

/**
 * Create a reusable ioredis client instance.
 */
declare function createRedisClient(options?: RedisConnectionOptions): Redis;

/**
 * Execute high-speed batched seeding into Redis using pipelines.
 */
declare function executeSeed(redis: Redis, rows: ParsedRow[], options: SeedOptions): Promise<SeedResult>;

interface KeyInspection {
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
declare function inspectKey(redis: Redis, key: string, sampleCount?: number): Promise<KeyInspection>;

export { type KeyInspection, type ParsedRow, type RedisConnectionOptions, type RedisStructure, type SeedOptions, type SeedResult, createRedisClient, executeSeed, extractRowValue, generateK6Snippet, inspectKey, loadAndParseFile, parseCSV, parseJSONOrJSONL, parseLines, renderTemplate };
