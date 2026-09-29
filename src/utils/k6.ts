import { RedisStructure } from "../types.js";

/**
 * Generate ready-to-use k6 test script snippets using xk6-redis or HTTP mocks.
 */
export function generateK6Snippet(keyName: string, structure: RedisStructure): string {
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

  // Default string / hash snippet
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
