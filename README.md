# ⚡ rediseed (`seedx` / `redisx`)

> **Blazing-fast Redis data seeder & loader from CSV, JSON, and line streams.**  
> Built for k6 performance testing, unique token popping (`SPOP`), queue fixture populating, and instant Redis inspection.

[![npm version](https://img.shields.io/npm/v/rediseed.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/rediseed)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## 🚀 Key Features

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

## ⚡ Quick Usage Examples

### 1. 🎯 Load Test User Tokens into a Redis Set (for k6 `SPOP`)

Given a `users.csv` file:
```csv
id,username,token
1,alice,tok_live_948172
2,bob,tok_live_109283
3,charlie,tok_live_771920
```

Load all tokens into a Redis set `k6:auth_tokens`:
```bash
# Using the shortcut set command
seedx set k6:auth_tokens users.csv --column token --flush

# Or with custom Redis URL
seedx set k6:auth_tokens users.csv --column token --url redis://:password@10.0.0.1:6379/0
```

---

### 2. 🧩 Seed Hash Records with Dynamic Key Templating

Seed each row as an individual Redis Hash keyed by user ID:
```bash
seedx seed users.csv --structure hash --key "app:users:{{id}}" --flush
```

---

### 3. 🔍 Inspect Seeded Redis Keys

Verify the count, data type, memory footprint, and preview sample items:
```bash
seedx inspect k6:auth_tokens
```

Output:
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
```

---

### 4. 📝 Generate k6 Load Test Script

Generate a ready-to-run k6 test script consuming the seeded tokens via `xk6-redis`:
```bash
seedx k6 k6:auth_tokens --structure set
```

Output:
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
    console.warn('Tokens exhausted!');
    return;
  }

  const res = http.get('https://api.example.com/v1/profile', {
    headers: { Authorization: `Bearer ${uniqueToken}` },
  });

  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(0.1);
}
```

---

## 🛠️ CLI Options Reference

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

## 🛡️ License

MIT © [authoritydmc](https://github.com/authoritydmc)
