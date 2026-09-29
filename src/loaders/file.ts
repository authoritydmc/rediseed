import fs from "fs";
import { parse } from "csv-parse/sync";
import { ParsedRow } from "../types.js";

/**
 * Parse a CSV string or file content into array of row objects.
 */
export function parseCSV(content: string, delimiter: string = ","): ParsedRow[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
    cast: false,
  });
  return records;
}

/**
 * Parse a JSON array, single JSON object, or JSONL string into array of row objects.
 */
export function parseJSONOrJSONL(content: string): ParsedRow[] {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("JSON root must be an array of objects.");
    return parsed;
  }

  // Check if it is line-delimited JSON (JSONL)
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    if (line.startsWith("{") && line.endsWith("}")) {
      rows.push(JSON.parse(line));
    } else {
      // Plain text single column line
      rows.push({ value: line });
    }
  }

  return rows;
}

/**
 * Parse plain text lines into { value: line } rows.
 */
export function parseLines(content: string): ParsedRow[] {
  return content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => ({ value: l }));
}

/**
 * Auto-detect file format from extension and contents.
 */
export function loadAndParseFile(filePath: string): ParsedRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const ext = filePath.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    return parseCSV(content);
  } else if (ext === "tsv") {
    return parseCSV(content, "\t");
  } else if (ext === "json" || ext === "jsonl" || ext === "ndjson") {
    return parseJSONOrJSONL(content);
  } else if (ext === "txt") {
    return parseLines(content);
  }

  // Fallback try JSON then CSV then lines
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
