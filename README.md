# ⚡ rediseed (`seedx` / `redisx`)

> **Blazing-fast Redis data seeder & loader from CSV, JSON, and line streams.**  
> Built for k6 load testing, unique token popping (`SPOP`), queue fixture populating, and instant Redis inspection.

[![CI](https://github.com/authoritydmc/rediseed/actions/workflows/ci.yml/badge.svg)](https://github.com/authoritydmc/rediseed/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/rediseed.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/rediseed)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)

---

## ⚡ Highlights

- 🏎️ **High Throughput**: Pipelined batch insertion processing 100k+ records/sec.
- 🎯 **Load-Testing Ready (k6 / Locust / JMeter)**: Pre-seed test users, auth tokens, or session IDs into Redis Sets for collision-free `SPOP` or `SRANDMEMBER` consumption.
- 📁 **Universal Input Formats**: Auto-detects and loads **CSV**, **TSV**, **JSON arrays**, **JSONL / NDJSON**, and plaintext line streams.
- 🗄️ **All Redis Structures Supported**:
  - **Sets (`SADD`)**: Collision-free unique user/token pools.
  - **Lists (`RPUSH` / `LPUSH`)**: FIFO order queues & worker queues.
  - **Hashes (`HSET`)**: Structured records indexed by primary key column.
  - **Sorted Sets (`ZADD`)**: Prioritized or timestamp-ordered items.
  - **String Keys (`SET`)**: Individual key-values with optional TTL expiration.
- 🧩 **Dynamic Key & Value Templating**: Define schema patterns like `--key "user:{{tenant_id}}:{{user_id}}"` or `--value "{{email}}:{{token}}"`.
- 🔍 **Inspect & Verify**: Check key data types, card/lengths, memory usage, and preview sample items in the terminal.
- 📝 **k6 Snippet Generator**: Instantly generate ready-to-run `xk6-redis` load testing scripts.

---

## 📦 Installation

Run instantly via `npx` or install globally:

```bash
# Run directly with npx
npx rediseed --help
npx seedx --help
npx redisx --help

# Or install globally
npm install -g rediseed
```

---

## 🛠️ Real-World Use Cases & Expected Outputs

### Use Case 1: k6 Load Test — Pre-Seeding 50,000 Unique User Tokens (Set / SPOP)
**Problem**: In high-load performance tests (e.g. 5,000 virtual users), tests fail with 409 Conflict if multiple virtual users use the same user token simultaneously.  
**Solution**: Seed tokens into a Redis Set, allowing k6 to atomically pop unique tokens via `client.spop()`.

Given `test_users.csv`:
```csv
id,email,auth_token
1,user1@test.com,tok_live_948172
2,user2@test.com,tok_live_109283
3,user3@test.com,tok_live_771920
```

Seed command:
```bash
seedx set k6:auth_tokens test_users.csv --column auth_token --flush
```

**Expected Output**:
```text
✔ Successfully loaded 50,000 unique items into Redis Set: k6:auth_tokens (312ms)
```

---

### Use Case 2: Populating Worker Queue Fixtures (FIFO Lists)
**Problem**: QA engineers need to simulate a backlog of 10,000 incoming orders for background worker load testing.  
**Solution**: Seed JSON payloads into a Redis List using `structure list`.

Given `orders.jsonl`:
```json
{"order_id": "ORD-101", "sku": "ITEM_A", "amount": 49.99}
{"order_id": "ORD-102", "sku": "ITEM_B", "amount": 12.50}
```

Seed command:
```bash
seedx seed orders.jsonl --structure list --key "queue:orders" --flush
```

**Expected Output**:
```text
🌱 rediseed — Loading data from: orders.jsonl
  • Parsed 10,000 records.

✔ Seeding completed successfully!
  • Structure: LIST
  • Target Key: queue:orders
  • Total Items: 10,000
  • Speed: 142,857 ops/sec (70ms)
```

---

### Use Case 3: Ingesting Microservice Entities as Redis Hashes
**Problem**: Pre-populate Redis cache with mock customer profiles for API integration tests.  
**Solution**: Ingest full CSV rows as Redis Hashes using dynamic key templating `--key "user:{{id}}"`.

```bash
seedx seed customers.csv --structure hash --key "customer:{{id}}" --ttl 3600 --flush
```

**Expected Output**:
```text
✔ Seeding completed successfully!
  • Structure: HASH
  • Target Key: customer:{{id}}
  • Total Items: 25,000
  • Speed: 88,420 ops/sec (282ms)
```

---

### Use Case 4: Inspecting Key Count, Memory & Sample Items
**Problem**: Developers need to verify what was seeded in Redis without opening heavy GUI clients.  
**Solution**: Run `seedx inspect <key>`.

```bash
seedx inspect k6:auth_tokens
```

**Expected Output**:
```text
🔍 Redis Key Inspector
  • Key: k6:auth_tokens
  • Type: SET
  • Total Items: 50,000
  • TTL: No Expiration
  • Memory Usage: 412.50 KB

Sample Items:
  • tok_live_948172
  • tok_live_109283
  • tok_live_771920
  • tok_live_339182
  • tok_live_882910
```

---

### Use Case 5: Instant k6 Load Test Script Generation
**Problem**: Writing boilerplate connection code and `spop` logic for `xk6-redis`.  
**Solution**: Run `seedx k6 <key>` to generate copy-paste ready k6 scripts.

```bash
seedx k6 k6:auth_tokens --structure set
```

**Expected Output**:
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import redis from 'k6/x/redis';

const client = new redis.Client('redis://localhost:6379');

export const options = {
  vus: 50,
  duration: '1m',
};

export default function () {
  // Pop unique token (guarantees NO collision between VUs)
  const uniqueToken = client.spop('k6:auth_tokens');

  if (!uniqueToken) {
    console.warn('Redis set "k6:auth_tokens" is exhausted!');
    return;
  }

  const res = http.get('https://api.example.com/v1/user/profile', {
    headers: {
      Authorization: `Bearer ${uniqueToken}`,
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(0.1);
}
```

---

## ⚙️ CLI Options Reference

```text
Usage: rediseed [options] [command]

Options:
  -v, --version               Output current version
  -u, --url <url>             Redis connection URL (redis:// or rediss://)
  -h, --host <host>           Redis host (default: "127.0.0.1")
  -p, --port <port>           Redis port (default: "6379")
  -a, --password <password>   Redis password
  -n, --db <db>               Redis database index (0-15)
  --tls                       Enable TLS connection

Commands:
  seed [options] <file>       Seed CSV, JSON, or line file into Redis
  set [options] <key> <file>  Shortcut to load column into Redis Set
  inspect [options] <key>     Inspect type, item count, memory & samples
  k6 [options] <key>          Generate ready-to-run k6 test script
```

---

## 📄 License

MIT © 2026 authoritydmc
