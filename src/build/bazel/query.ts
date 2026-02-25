/**
 * Bazel query helpers — label parsing, validation, and query execution.
 *
 * Keeps all `bazel query` I/O in one place so the rest of the code deals
 * only with typed BuildTarget objects.
 */

import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Label types and parsing
// ---------------------------------------------------------------------------

export interface BazelLabel {
  /** Workspace prefix, e.g. '@myworkspace' — empty string for the default workspace. */
  workspace: string;
  /** Package path relative to the workspace root, e.g. 'src/app'. */
  package: string;
  /** Target name within the package, e.g. 'server'. */
  target: string;
  /** Full canonical label, e.g. '//src/app:server' or '@ws//src/app:server'. */
  canonical: string;
}

/**
 * Parse a Bazel label string into its components.
 *
 * Supported formats:
 *   //pkg:target
 *   //pkg              (target defaults to last component of pkg)
 *   @workspace//pkg:target
 *
 * Returns null for strings that do not look like Bazel labels.
 */
export function parseBazelLabel(label: string): BazelLabel | null {
  const s = label.trim();

  const slashSlash = s.indexOf('//');
  if (slashSlash === -1) {
    return null;
  }

  const workspace = slashSlash > 0 ? s.slice(0, slashSlash) : '';
  const rest = s.slice(slashSlash + 2); // everything after '//'

  let pkg: string;
  let target: string;

  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) {
    // //pkg — target name = last path segment
    pkg = rest;
    const parts = rest.split('/');
    target = parts[parts.length - 1];
  } else {
    pkg = rest.slice(0, colonIdx);
    target = rest.slice(colonIdx + 1);
  }

  if (!target) {
    return null;
  }

  const canonical = `${workspace}//${pkg}:${target}`;
  return { workspace, package: pkg, target, canonical };
}

/** Returns true if the string is a syntactically valid Bazel label. */
export function isValidBazelLabel(label: string): boolean {
  return parseBazelLabel(label) !== null;
}

// ---------------------------------------------------------------------------
// Query output parsing
// ---------------------------------------------------------------------------

/**
 * Parse the newline-separated output from `bazel query --output=label`
 * into an array of label strings, filtering blanks and comments.
 */
export function parseBazelQueryOutput(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

// ---------------------------------------------------------------------------
// Query execution
// ---------------------------------------------------------------------------

export interface BazelQueryOptions {
  /** Absolute path to the Bazel workspace root. */
  workspaceRoot: string;
  /** Startup flags inserted before the `query` sub-command. */
  startupFlags?: string[];
  /** Timeout in ms. Defaults to 30 000. */
  timeout?: number;
}

/**
 * Run `bazel query <expr>` and return the list of matching label strings.
 * Returns an empty array if Bazel is unavailable or the query fails.
 */
export function runBazelQuery(query: string, options: BazelQueryOptions): string[] {
  try {
    const startupPart = (options.startupFlags ?? []).join(' ');
    const querySafe = shellQuote(query);
    const cmd = [
      'bazel',
      startupPart,
      'query',
      querySafe,
      '--output=label',
      '--noshow_progress',
      '2>/dev/null',
    ]
      .filter(Boolean)
      .join(' ');

    const out = execSync(cmd, {
      cwd: options.workspaceRoot,
      encoding: 'utf-8',
      timeout: options.timeout ?? 30000,
    });

    return parseBazelQueryOutput(out);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@%^,()+*?[\]!]+$/.test(s)) {
    return s;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}
