#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import picocolors from "picocolors";

// src/loaders/file.ts
import fs from "fs";
import { parse } from "csv-parse/sync";
function parseCSV(content, delimiter = ",") {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
    cast: false
  });
  return records;
}
function parseJSONOrJSONL(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("JSON root must be an array of objects.");
    return parsed;
  }
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (line.startsWith("{") && line.endsWith("}")) {
      rows.push(JSON.parse(line));
    } else {
      rows.push({ value: line });
    }
  }
  return rows;
}
function parseLines(content) {
  return content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => ({ value: l }));
}
function loadAndParseFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    return parseCSV(content);
  } else if (ext === "tsv") {
    return parseCSV(content, "	");
  } else if (ext === "json" || ext === "jsonl" || ext === "ndjson") {
    return parseJSONOrJSONL(content);
  } else if (ext === "txt") {
    return parseLines(content);
  }
  try {
    return parseJSONOrJSONL(content);
  } catch {
    try {
      return parseCSV(content);
    } catch {
      return parseLines(content);
    }
  }
}

// src/engine/client.ts
import { Redis } from "ioredis";
function createRedisClient(options = {}) {
  const url = options.url || process.env.REDIS_URL || process.env.REDIS_URI;
  if (url) {
    return new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true
    });
  }
  const redisConfig = {
    host: options.host || process.env.REDIS_HOST || "127.0.0.1",
    port: options.port || (process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379),
    password: options.password || process.env.REDIS_PASSWORD || void 0,
    db: options.db !== void 0 ? options.db : process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
    maxRetriesPerRequest: 3,
    lazyConnect: false
  };
  if (options.tls) {
    redisConfig.tls = {};
  }
  return new Redis(redisConfig);
}

// src/utils/template.ts
function renderTemplate(template, row) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
    return row[key] !== void 0 ? String(row[key]) : "";
  });
}
function extractRowValue(row, column, valueTemplate) {
  if (valueTemplate) {
    return renderTemplate(valueTemplate, row);
  }
  if (column && row[column] !== void 0) {
    return String(row[column]);
  }
  const keys = Object.keys(row);
  if (keys.length === 1) {
    return String(row[keys[0]]);
  }
  return JSON.stringify(row);
}

// src/engine/seeder.ts
async function executeSeed(redis, rows, options) {
  const startTime = Date.now();
  const batchSize = options.batchSize || 1e3;
  let totalInserted = 0;
  const uniqueKeys = /* @__PURE__ */ new Set();
  if (options.flushFirst && options.keyName && !options.keyName.includes("{{")) {
    await redis.del(options.keyName);
  }
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const pipeline = redis.pipeline();
    for (const row of batch) {
      const targetKey = options.keyName ? renderTemplate(options.keyName, row) : "seed:data";
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
          const hashFields = {};
          for (const [k, v] of Object.entries(row)) {
            hashFields[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
          }
          pipeline.hset(targetKey, hashFields);
          if (options.ttl) {
            pipeline.expire(targetKey, options.ttl);
          }
          break;
        case "zset":
          const score = options.scoreColumn && row[options.scoreColumn] !== void 0 ? parseFloat(row[options.scoreColumn]) || 0 : Date.now();
          pipeline.zadd(targetKey, score, val);
          break;
      }
    }
    await pipeline.exec();
    totalInserted += batch.length;
  }
  const elapsedMs = Math.max(1, Date.now() - startTime);
  const opsPerSec = Math.round(totalInserted / elapsedMs * 1e3);
  return {
    totalProcessed: rows.length,
    totalInserted,
    elapsedMs,
    opsPerSec,
    structure: options.structure,
    keysAffected: uniqueKeys.size
  };
}

// src/engine/inspector.ts
async function inspectKey(redis, key, sampleCount = 5) {
  const [type, ttl] = await Promise.all([
    redis.type(key),
    redis.ttl(key)
  ]);
  let count = 0;
  let samples = [];
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
  let memoryBytes;
  try {
    const memory = await redis.memory("USAGE", key);
    if (typeof memory === "number") memoryBytes = memory;
  } catch {
  }
  return {
    key,
    type,
    count,
    memoryBytes,
    ttl,
    samples
  };
}

// src/utils/k6.ts
function generateK6Snippet(keyName, structure) {
  if (structure === "set") {
    return `// ==========================================
// k6 Load Test - Redis Set Data Consumption
// Requirements: xk6-redis (k6 run --vus 50 --duration 1m script.js)
// ==========================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import redis from 'k6/x/redis';

// Connect to Redis
const client = new redis.Client('redis://localhost:6379');

export const options = {
  vus: 50,
  duration: '1m',
};

export default function () {
  // Option A: Pop unique token (guarantees NO collision between VUs)
  const uniqueToken = client.spop('${keyName}');

  // Option B: Random sample (if token is reusable across VUs)
  // const uniqueToken = client.srandmember('${keyName}');

  if (!uniqueToken) {
    console.warn('Redis set "${keyName}" is exhausted!');
    return;
  }

  // Execute authenticated HTTP request using seeded token
  const res = http.get('https://api.example.com/v1/user/profile', {
    headers: {
      Authorization: \`Bearer \${uniqueToken}\`,
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(0.1);
}
`;
  }
  if (structure === "list") {
    return `// ==========================================
// k6 Load Test - Redis Queue / List FIFO
// Requirements: xk6-redis
// ==========================================
import http from 'k6/http';
import { check } from 'k6';
import redis from 'k6/x/redis';

const client = new redis.Client('redis://localhost:6379');

export default function () {
  // Pop from FIFO queue
  const item = client.lpop('${keyName}');

  if (!item) {
    console.warn('Queue "${keyName}" is empty!');
    return;
  }

  const payload = JSON.parse(item);
  const res = http.post('https://api.example.com/v1/orders', JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, { 'status is 201': (r) => r.status === 201 });
}
`;
  }
  return `// ==========================================
// k6 Load Test - Redis Key-Value Fetch
// Requirements: xk6-redis
// ==========================================
import http from 'k6/http';
import { check } from 'k6';
import redis from 'k6/x/redis';

const client = new redis.Client('redis://localhost:6379');

export default function () {
  const value = client.get('${keyName}');
  const res = http.get(\`https://api.example.com/v1/item/\${value}\`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
`;
}

// src/cli.ts
async function main() {
  const program = new Command();
  program.name("rediseed").description(
    "Blazing-fast Redis data seeder & loader from CSV, JSON, and line streams for k6 load testing & staging fixtures."
  ).version("1.0.0", "-v, --version", "Output current version");
  program.option("-u, --url <url>", "Redis connection URL (e.g. redis://localhost:6379 or rediss:// for TLS)").option("-h, --host <host>", "Redis host", "127.0.0.1").option("-p, --port <port>", "Redis port", "6379").option("-a, --password <password>", "Redis auth password").option("-n, --db <db>", "Redis database index (0-15)", "0").option("--tls", "Enable TLS connection", false);
  program.command("seed <file>").description("Load and seed data from CSV, JSON, or TXT file into Redis").option("-s, --structure <type>", "Redis structure: set, list, hash, string, zset", "set").option("-k, --key <name>", "Destination Redis key name or template (e.g. 'k6:user_ids' or 'user:{{id}}')", "seed:data").option("-c, --column <col>", "Extract specific column/property (for set, list, string)").option("--value <template>", "Value template for string/hash (e.g. '{{email}}:{{token}}')").option("--score-column <col>", "Column for zset score (defaults to timestamp)").option("-b, --batch-size <size>", "Pipeline batch size", "1000").option("--ttl <seconds>", "TTL expiration in seconds for keys").option("--flush", "Delete destination key before inserting", false).option("--dry-run", "Preview parsing and first 5 rows without writing to Redis", false).action(async (file, options) => {
    try {
      const globalOpts = program.opts();
      console.log(picocolors.bold(`
\u{1F331} rediseed \u2014 Loading data from: ${picocolors.cyan(file)}`));
      const rows = loadAndParseFile(file);
      console.log(`  \u2022 Parsed ${picocolors.green(rows.length.toLocaleString())} records.`);
      if (options.dryRun) {
        console.log(picocolors.yellow("\n[DRY RUN PREVIEW - First 5 items]"));
        for (const row of rows.slice(0, 5)) {
          console.log("  ", JSON.stringify(row));
        }
        console.log(picocolors.dim(`
Would insert ${rows.length} items into Redis structure '${options.structure}' with key '${options.key}'.
`));
        return;
      }
      const redis = createRedisClient({
        url: globalOpts.url,
        host: globalOpts.host,
        port: parseInt(globalOpts.port, 10),
        password: globalOpts.password,
        db: parseInt(globalOpts.db, 10),
        tls: globalOpts.tls
      });
      const result = await executeSeed(redis, rows, {
        structure: options.structure,
        keyName: options.key,
        column: options.column,
        valueTemplate: options.value,
        scoreColumn: options.scoreColumn,
        batchSize: parseInt(options.batchSize, 10),
        flushFirst: options.flush,
        ttl: options.ttl ? parseInt(options.ttl, 10) : void 0
      });
      await redis.quit();
      console.log(picocolors.green(`
\u2714 Seeding completed successfully!`));
      console.log(`  \u2022 Structure: ${picocolors.cyan(result.structure.toUpperCase())}`);
      console.log(`  \u2022 Target Key: ${picocolors.cyan(options.key)}`);
      console.log(`  \u2022 Total Items: ${picocolors.bold(result.totalInserted.toLocaleString())}`);
      console.log(`  \u2022 Speed: ${picocolors.bold(result.opsPerSec.toLocaleString())} ops/sec (${result.elapsedMs}ms)
`);
    } catch (err) {
      console.error(picocolors.red(`\u2716 Error: ${err.message || err}`));
      process.exit(1);
    }
  });
  program.command("set <keyName> <file>").description("Shortcut to load a file column directly into a Redis Set (ideal for k6 SPOP unique IDs)").option("-c, --column <col>", "Extract specific column name from CSV/JSON").option("--flush", "Delete set before inserting", false).action(async (keyName, file, options) => {
    try {
      const globalOpts = program.opts();
      const rows = loadAndParseFile(file);
      const redis = createRedisClient({
        url: globalOpts.url,
        host: globalOpts.host,
        port: parseInt(globalOpts.port, 10),
        password: globalOpts.password,
        db: parseInt(globalOpts.db, 10),
        tls: globalOpts.tls
      });
      const result = await executeSeed(redis, rows, {
        structure: "set",
        keyName,
        column: options.column,
        flushFirst: options.flush
      });
      await redis.quit();
      console.log(picocolors.green(`
\u2714 Successfully loaded ${result.totalInserted.toLocaleString()} unique items into Redis Set: ${picocolors.cyan(keyName)} (${result.elapsedMs}ms)`));
    } catch (err) {
      console.error(picocolors.red(`\u2716 Error: ${err.message || err}`));
      process.exit(1);
    }
  });
  program.command("inspect <key>").description("Inspect item count, data type, memory usage, and samples from a Redis key").option("-s, --samples <count>", "Number of sample items to preview", "5").action(async (key, options) => {
    try {
      const globalOpts = program.opts();
      const redis = createRedisClient({
        url: globalOpts.url,
        host: globalOpts.host,
        port: parseInt(globalOpts.port, 10),
        password: globalOpts.password,
        db: parseInt(globalOpts.db, 10),
        tls: globalOpts.tls
      });
      const info = await inspectKey(redis, key, parseInt(options.samples, 10));
      await redis.quit();
      console.log(`
${picocolors.bold("\u{1F50D} Redis Key Inspector")}`);
      console.log(`  \u2022 Key: ${picocolors.cyan(info.key)}`);
      console.log(`  \u2022 Type: ${picocolors.green(info.type.toUpperCase())}`);
      console.log(`  \u2022 Total Items: ${picocolors.bold(info.count.toLocaleString())}`);
      console.log(`  \u2022 TTL: ${info.ttl === -1 ? "No Expiration" : `${info.ttl}s`}`);
      if (info.memoryBytes) {
        console.log(`  \u2022 Memory Usage: ${(info.memoryBytes / 1024).toFixed(2)} KB`);
      }
      console.log(`
${picocolors.bold("Sample Items:")}`);
      for (const sample of info.samples) {
        console.log(`  \u2022 ${sample}`);
      }
      console.log("");
    } catch (err) {
      console.error(picocolors.red(`\u2716 Error: ${err.message || err}`));
      process.exit(1);
    }
  });
  program.command("k6 <key>").description("Generate ready-to-use k6 load test script snippet consuming this Redis key").option("-s, --structure <type>", "Redis structure (set, list, string)", "set").action((key, options) => {
    const snippet = generateK6Snippet(key, options.structure);
    console.log(`
${snippet}
`);
  });
  await program.parseAsync(process.argv);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
//# sourceMappingURL=cli.mjs.map