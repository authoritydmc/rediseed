import { ParsedRow } from "../types.js";

/**
 * Render template string replacing `{{variable}}` with values from row.
 */
export function renderTemplate(template: string, row: ParsedRow): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
    return row[key] !== undefined ? String(row[key]) : "";
  });
}

/**
 * Extract item value from row based on column or template.
 */
export function extractRowValue(row: ParsedRow, column?: string, valueTemplate?: string): string {
  if (valueTemplate) {
    return renderTemplate(valueTemplate, row);
  }

  if (column && row[column] !== undefined) {
    return String(row[column]);
  }

  // If there's only 1 property in the row, use it
  const keys = Object.keys(row);
  if (keys.length === 1) {
    return String(row[keys[0]]);
  }

  // Otherwise return entire row as JSON string
  return JSON.stringify(row);
}
