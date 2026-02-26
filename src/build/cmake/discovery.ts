/**
 * CMake target discovery.
 * Combines File API parsing with CTest enumeration.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { BuildTarget } from '../../model/config';
import { parseReply, writeQueryFile } from './fileApi';

export interface DiscoveryOptions {
  workspaceRoot: string;
  buildDir: string;
  preset?: string;
}

/**
 * Ensure the File API query file is present and then parse any available reply.
 */
export async function discoverCMakeTargets(options: DiscoveryOptions): Promise<BuildTarget[]> {
  // Write query file so the next cmake run will produce a reply
  try {
    writeQueryFile(options.buildDir);
  } catch {
    // Not fatal — may not have write access
  }

  // Parse existing reply if available
  const executableTargets = parseReply(options.buildDir);

  // Also discover CTest tests
  const testTargets = discoverCtestTargets(options.buildDir);

  // Merge — if an executable is also a test, promote it to 'test' kind
  const testNames = new Set(testTargets.map((t) => t.name));
  const merged: BuildTarget[] = executableTargets.map((t) =>
    testNames.has(t.name) ? { ...t, kind: 'test' as const } : t,
  );

  // Add test targets not already in executables
  const execNames = new Set(executableTargets.map((t) => t.name));
  for (const t of testTargets) {
    if (!execNames.has(t.name)) {
      merged.push(t);
    }
  }

  return merged;
}

/** Run ctest --show-only=json-v1 to enumerate test targets. */
function discoverCtestTargets(buildDir: string): BuildTarget[] {
  try {
    const output = execSync('ctest --show-only=json-v1', {
      cwd: buildDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    });

    const json = JSON.parse(output) as { tests?: Array<{ name: string; command?: string[] }> };
    return (json.tests ?? []).map((t) => {
      const command = t.command?.[0];
      return {
        name: t.name,
        kind: 'test' as const,
        binaryPath: command ? path.resolve(buildDir, command) : undefined,
        buildSystem: 'cmake' as const,
      };
    });
  } catch {
    return [];
  }
}

/** Get the CMake binary path for a given preset and target. */
export function resolveCMakeBinaryPath(
  buildDir: string,
  targetName: string,
): string | undefined {
  // Try File API reply first
  const targets = parseReply(buildDir);
  const found = targets.find((t) => t.name === targetName);
  if (found?.binaryPath) {
    return path.resolve(buildDir, found.binaryPath);
  }

  // Fallback: search the build directory for an executable with the target name.
  // This handles the common case where the File API reply hasn't been generated yet
  // (build dir configured before the query file was written).
  return findBinaryInDir(buildDir, targetName);
}

/**
 * Recursively search `dir` for a regular executable file named `name`.
 * Skips CMake internal directories to keep the search fast.
 */
function findBinaryInDir(dir: string, name: string): string | undefined {
  const SKIP_DIRS = new Set(['CMakeFiles', '.cmake', 'CMakeTmp', '_deps']);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) { continue; }
      const found = findBinaryInDir(path.join(dir, entry.name), name);
      if (found) { return found; }
    } else if (entry.isFile() && entry.name === name) {
      const fullPath = path.join(dir, entry.name);
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        return fullPath;
      } catch {
        // not executable — keep searching
      }
    }
  }
  return undefined;
}
