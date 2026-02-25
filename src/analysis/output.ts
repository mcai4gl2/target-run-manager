/**
 * Output directory management and report opening for analysis runs.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve a possibly-template output dir path.
 * Expands ${date} and ${datetime} since those are runtime-only builtins.
 * Other ${...} variables are expected to have been expanded already by the
 * variable expander before reaching this module.
 */
export function resolveOutputDir(
  outputDir: string,
  workspaceFolder: string,
): string {
  const now = new Date();
  const date = formatDate(now);
  const datetime = formatDatetime(now);

  return outputDir
    .replace(/\$\{date\}/g, date)
    .replace(/\$\{datetime\}/g, datetime)
    .replace(/\$\{workspaceFolder\}/g, workspaceFolder);
}

/**
 * Ensure an output directory exists, creating it recursively if needed.
 * Returns the resolved absolute path.
 */
export function ensureOutputDir(outputDir: string): string {
  const resolved = path.resolve(outputDir);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

/**
 * Build the default output directory for a given config id and tool.
 * Falls back to <workspaceFolder>/out/analysis/<date>/<configId>/<tool>
 */
export function defaultOutputDir(
  workspaceFolder: string,
  configId: string,
  tool: string,
): string {
  const now = new Date();
  return path.join(
    workspaceFolder,
    'out',
    'analysis',
    formatDate(now),
    configId,
    tool,
  );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDatetime(d: Date): string {
  const date = formatDate(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${date}T${hh}:${mm}:${ss}`;
}
