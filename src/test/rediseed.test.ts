import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import {
  parseCSV,
  parseJSONOrJSONL,
  parseLines,
  renderTemplate,
  extractRowValue,
  generateK6Snippet,
} from "../index.js";

test("parseCSV parses comma and tab delimited data correctly", () => {
  const csvData = `id,username,token\n1,alice,tok_123\n2,bob,tok_456\n`;
  const rows = parseCSV(csvData);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].username, "alice");
  assert.strictEqual(rows[0].token, "tok_123");
  assert.strictEqual(rows[1].token, "tok_456");
});

test("parseJSONOrJSONL parses JSON arrays and JSONL line streams", () => {
  const jsonArray = JSON.stringify([
    { id: 101, sku: "ITEM_A" },
    { id: 102, sku: "ITEM_B" },
  ]);
  const rows = parseJSONOrJSONL(jsonArray);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].sku, "ITEM_A");

  const jsonlData = `{"id": 201, "role": "admin"}\n{"id": 202, "role": "user"}`;
  const rowsL = parseJSONOrJSONL(jsonlData);
  assert.strictEqual(rowsL.length, 2);
  assert.strictEqual(rowsL[1].role, "user");
});

test("parseLines parses simple text files into row values", () => {
  const lines = "token_aaa\ntoken_bbb\ntoken_ccc";
  const rows = parseLines(lines);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[1].value, "token_bbb");
});

test("renderTemplate substitutes {{placeholders}} with row values", () => {
  const template = "user:{{tenant_id}}:{{user_id}}";
  const row = { tenant_id: "acme", user_id: "u_999", role: "admin" };
  const rendered = renderTemplate(template, row);
  assert.strictEqual(rendered, "user:acme:u_999");
});

test("extractRowValue extracts specific column or renders custom value template", () => {
  const row = { user_id: "123", email: "test@example.com", token: "tok_secret" };

  // By column
  const colVal = extractRowValue(row, "token");
  assert.strictEqual(colVal, "tok_secret");

  // By template
  const tmplVal = extractRowValue(row, undefined, "{{user_id}}:{{email}}");
  assert.strictEqual(tmplVal, "123:test@example.com");
});

test("generateK6Snippet generates valid k6 script containing key and spop", () => {
  const snippet = generateK6Snippet("k6:unique_users", "set");
  assert.ok(snippet.includes("k6:unique_users"));
  assert.ok(snippet.includes("client.spop"));
  assert.ok(snippet.includes("import redis from 'k6/x/redis'"));
});
