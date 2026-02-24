/**
 * Discovers all config files under .vscode/target-manager/ (recursively),
 * or falls back to .vscode/target-manager.yaml / .json.
 *
 * Files are returned in load order: depth-first, alphabetical within each directory.
 */

import * as fs from 'fs';
import * as path from 'path';

export const CONFIG_DIR = '.vscode/target-manager';
export const FALLBACK_YAML = '.vscode/target-manager.yaml';
export const FALLBACK_YML = '.vscode/target-manager.yml';
export const FALLBACK_JSON = '.vscode/target-manager.json';

const SUPPORTED_EXTS = new Set(['.yaml', '.yml', '.json']);

/**
 * Discover all config file paths for the given workspace root.
 * Returns paths in the correct load order.
 */
export function discoverConfigFiles(workspaceRoot: string): string[] {
  const configDir = path.join(workspaceRoot, CONFIG_DIR);

  if (fs.existsSync(configDir) && fs.statSync(configDir).isDirectory()) {
    return collectFilesDepthFirst(configDir);
  }

  // Fallback: single file
  for (const fallback of [FALLBACK_YAML, FALLBACK_YML, FALLBACK_JSON]) {
    const p = path.join(workspaceRoot, fallback);
    if (fs.existsSync(p)) {
      return [p];
    }
  }

  return [];
}

/**
 * Recursively collect all supported config files under dir,
 * in depth-first alphabetical order (files in dir before subdirs).
 */
function collectFilesDepthFirst(dir: string): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  // Sort alphabetically
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files: string[] = [];
  const dirs: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      dirs.push(fullPath);
    } else if (entry.isFile() && SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  // Files in current dir first (alphabetical), then recurse into subdirs
  results.push(...files);
  for (const subDir of dirs) {
    results.push(...collectFilesDepthFirst(subDir));
  }

  return results;
}

/** Return the config directory path if it exists, else undefined. */
export function getConfigDir(workspaceRoot: string): string | undefined {
  const configDir = path.join(workspaceRoot, CONFIG_DIR);
  return fs.existsSync(configDir) ? configDir : undefined;
}

/** Return the single-file fallback path if it exists, else undefined. */
export function getFallbackFile(workspaceRoot: string): string | undefined {
  for (const fallback of [FALLBACK_YAML, FALLBACK_YML, FALLBACK_JSON]) {
    const p = path.join(workspaceRoot, fallback);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}
