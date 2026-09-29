import { Command } from "commander";
import picocolors from "picocolors";
import { loadAndParseFile } from "./loaders/file.js";
import { createRedisClient } from "./engine/client.js";
import { executeSeed } from "./engine/seeder.js";
import { inspectKey } from "./engine/inspector.js";
import { generateK6Snippet } from "./utils/k6.js";
import { RedisStructure } from "./types.js";

async function main() {
  const program = new Command();

  program
    .name("rediseed")
    .description(
      "Blazing-fast Redis data seeder & loader from CSV, JSON, and line streams for k6 load testing & staging fixtures."
    )
    .version("1.0.0", "-v, --version", "Output current version");

  // Global Redis Options
  program
    .option("-u, --url <url>", "Redis connection URL (e.g. redis://localhost:6379 or rediss:// for TLS)")
    .option("-h, --host <host>", "Redis host", "127.0.0.1")
    .option("-p, --port <port>", "Redis port", "6379")
    .option("-a, --password <password>", "Redis auth password")
    .option("-n, --db <db>", "Redis database index (0-15)", "0")
    .option("--tls", "Enable TLS connection", false);

  // 1. Seed Command
  program
    .command("seed <file>")
    .description("Load and seed data from CSV, JSON, or TXT file into Redis")
    .option("-s, --structure <type>", "Redis structure: set, list, hash, string, zset", "set")
    .option("-k, --key <name>", "Destination Redis key name or template (e.g. 'k6:user_ids' or 'user:{{id}}')", "seed:data")
    .option("-c, --column <col>", "Extract specific column/property (for set, list, string)")
    .option("--value <template>", "Value template for string/hash (e.g. '{{email}}:{{token}}')")
    .option("--score-column <col>", "Column for zset score (defaults to timestamp)")
    .option("-b, --batch-size <size>", "Pipeline batch size", "1000")
    .option("--ttl <seconds>", "TTL expiration in seconds for keys")
    .option("--flush", "Delete destination key before inserting", false)
    .option("--dry-run", "Preview parsing and first 5 rows without writing to Redis", false)
    .action(async (file, options) => {
      try {
        const globalOpts = program.opts();
        console.log(picocolors.bold(`\n🌱 rediseed — Loading data from: ${picocolors.cyan(file)}`));

        const rows = loadAndParseFile(file);
        console.log(`  • Parsed ${picocolors.green(rows.length.toLocaleString())} records.`);

        if (options.dryRun) {
          console.log(picocolors.yellow("\n[DRY RUN PREVIEW - First 5 items]"));
          for (const row of rows.slice(0, 5)) {
            console.log("  ", JSON.stringify(row));
          }
          console.log(picocolors.dim(`\nWould insert ${rows.length} items into Redis structure '${options.structure}' with key '${options.key}'.\n`));
          return;
        }

        const redis = createRedisClient({
          url: globalOpts.url,
          host: globalOpts.host,
          port: parseInt(globalOpts.port, 10),
          password: globalOpts.password,
          db: parseInt(globalOpts.db, 10),
          tls: globalOpts.tls,
        });

        const result = await executeSeed(redis, rows, {
          structure: options.structure as RedisStructure,
          keyName: options.key,
          column: options.column,
          valueTemplate: options.value,
          scoreColumn: options.scoreColumn,
          batchSize: parseInt(options.batchSize, 10),
          flushFirst: options.flush,
          ttl: options.ttl ? parseInt(options.ttl, 10) : undefined,
        });

        await redis.quit();

        console.log(picocolors.green(`\n✔ Seeding completed successfully!`));
        console.log(`  • Structure: ${picocolors.cyan(result.structure.toUpperCase())}`);
        console.log(`  • Target Key: ${picocolors.cyan(options.key)}`);
        console.log(`  • Total Items: ${picocolors.bold(result.totalInserted.toLocaleString())}`);
        console.log(`  • Speed: ${picocolors.bold(result.opsPerSec.toLocaleString())} ops/sec (${result.elapsedMs}ms)\n`);
      } catch (err: any) {
        console.error(picocolors.red(`✖ Error: ${err.message || err}`));
        process.exit(1);
      }
    });

  // 2. Set Shortcut Command (seed directly into a Redis Set for k6 SPOP)
  program
    .command("set <keyName> <file>")
    .description("Shortcut to load a file column directly into a Redis Set (ideal for k6 SPOP unique IDs)")
    .option("-c, --column <col>", "Extract specific column name from CSV/JSON")
    .option("--flush", "Delete set before inserting", false)
    .action(async (keyName, file, options) => {
      try {
        const globalOpts = program.opts();
        const rows = loadAndParseFile(file);

        const redis = createRedisClient({
          url: globalOpts.url,
          host: globalOpts.host,
          port: parseInt(globalOpts.port, 10),
          password: globalOpts.password,
          db: parseInt(globalOpts.db, 10),
          tls: globalOpts.tls,
        });

        const result = await executeSeed(redis, rows, {
          structure: "set",
          keyName,
          column: options.column,
          flushFirst: options.flush,
        });

        await redis.quit();

        console.log(picocolors.green(`\n✔ Successfully loaded ${result.totalInserted.toLocaleString()} unique items into Redis Set: ${picocolors.cyan(keyName)} (${result.elapsedMs}ms)`));
      } catch (err: any) {
        console.error(picocolors.red(`✖ Error: ${err.message || err}`));
        process.exit(1);
      }
    });

  // 3. Inspect Command
  program
    .command("inspect <key>")
    .description("Inspect item count, data type, memory usage, and samples from a Redis key")
    .option("-s, --samples <count>", "Number of sample items to preview", "5")
    .action(async (key, options) => {
      try {
        const globalOpts = program.opts();
        const redis = createRedisClient({
          url: globalOpts.url,
          host: globalOpts.host,
          port: parseInt(globalOpts.port, 10),
          password: globalOpts.password,
          db: parseInt(globalOpts.db, 10),
          tls: globalOpts.tls,
        });

        const info = await inspectKey(redis, key, parseInt(options.samples, 10));
        await redis.quit();

        console.log(`\n${picocolors.bold("🔍 Redis Key Inspector")}`);
        console.log(`  • Key: ${picocolors.cyan(info.key)}`);
        console.log(`  • Type: ${picocolors.green(info.type.toUpperCase())}`);
        console.log(`  • Total Items: ${picocolors.bold(info.count.toLocaleString())}`);
        console.log(`  • TTL: ${info.ttl === -1 ? "No Expiration" : `${info.ttl}s`}`);
        if (info.memoryBytes) {
          console.log(`  • Memory Usage: ${(info.memoryBytes / 1024).toFixed(2)} KB`);
        }
        console.log(`\n${picocolors.bold("Sample Items:")}`);
        for (const sample of info.samples) {
          console.log(`  • ${sample}`);
        }
        console.log("");
      } catch (err: any) {
        console.error(picocolors.red(`✖ Error: ${err.message || err}`));
        process.exit(1);
      }
    });

  // 4. Generate k6 Snippet
  program
    .command("k6 <key>")
    .description("Generate ready-to-use k6 load test script snippet consuming this Redis key")
    .option("-s, --structure <type>", "Redis structure (set, list, string)", "set")
    .action((key, options) => {
      const snippet = generateK6Snippet(key, options.structure as RedisStructure);
      console.log(`\n${snippet}\n`);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
