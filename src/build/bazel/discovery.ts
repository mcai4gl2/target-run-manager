/**
 * Bazel target discovery — wraps `bazel query` to produce typed BuildTarget lists.
 */

import * as path from 'path';
import type { BuildTarget } from '../../model/config';
import { runBazelQuery, parseBazelLabel } from './query';
import type { BazelQueryOptions } from './query';

export interface BazelDiscoveryOptions {
  /** Absolute path to the Bazel workspace root. */
  workspaceRoot: string;
  /** Optional startup flags forwarded to bazel. */
  startupFlags?: string[];
}

/**
 * Discover all runnable binary and test targets in the Bazel workspace.
 *
 * Runs two queries:
 *   - `kind(".*_binary", //...)` → executables
 *   - `kind(".*_test",   //...)` → tests
 *
 * Deduplicates labels that appear in both (promotes to 'test' kind).
 */
export async function discoverBazelTargets(
  options: BazelDiscoveryOptions,
): Promise<BuildTarget[]> {
  const queryOpts: BazelQueryOptions = {
    workspaceRoot: options.workspaceRoot,
    startupFlags: options.startupFlags,
  };

  const binaryLabels = runBazelQuery('kind(".*_binary", //...)', queryOpts);
  const testLabels = runBazelQuery('kind(".*_test", //...)', queryOpts);

  const targets: BuildTarget[] = [];
  const seen = new Set<string>();

  for (const label of binaryLabels) {
    if (seen.has(label)) { continue; }
    seen.add(label);
    const parsed = parseBazelLabel(label);
    if (!parsed) { continue; }
    targets.push({
      name: label,
      label,
      kind: 'executable',
      binaryPath: path.join('bazel-bin', parsed.package, parsed.target),
      buildSystem: 'bazel',
    });
  }

  for (const label of testLabels) {
    if (seen.has(label)) { continue; }
    seen.add(label);
    const parsed = parseBazelLabel(label);
    if (!parsed) { continue; }
    targets.push({
      name: label,
      label,
      kind: 'test',
      binaryPath: path.join('bazel-bin', parsed.package, parsed.target),
      buildSystem: 'bazel',
    });
  }

  return targets;
}

/**
 * Resolve the absolute path to the Bazel-built binary for a label.
 * Uses the conventional `<workspaceRoot>/bazel-bin/<package>/<target>` path.
 * Returns undefined if the label cannot be parsed.
 */
export function resolveBazelBinaryPath(
  label: string,
  workspaceRoot: string,
): string | undefined {
  const parsed = parseBazelLabel(label);
  if (!parsed) { return undefined; }
  return path.join(workspaceRoot, 'bazel-bin', parsed.package, parsed.target);
}
