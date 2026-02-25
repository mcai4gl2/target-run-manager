/**
 * Parse BUILD / BUILD.bazel to find binary and test targets.
 * Constructs full Bazel labels from the file path.
 */

import * as path from 'path';
import type { ParsedTarget } from './types';

// Matches a rule invocation opening paren, captures the rule name
const RULE_RE = /\b(cc_binary|cc_test|py_binary|java_binary)\s*\(/g;

// Matches name = "value" or name = 'value' inside a rule body
const NAME_ATTR_RE = /\bname\s*=\s*["']([^"']+)["']/;

/**
 * Extract all binary/test targets from a BUILD or BUILD.bazel file.
 *
 * @param content        Raw file content.
 * @param filePath       Absolute path to the BUILD file.
 * @param workspaceRoot  Absolute workspace root path (for label construction).
 */
export function parseBuildFile(
  content: string,
  filePath: string,
  workspaceRoot: string,
): ParsedTarget[] {
  const targets: ParsedTarget[] = [];
  const seen = new Set<string>();

  const pkg = getBazelPackage(filePath, workspaceRoot);

  let m: RegExpExecArray | null;
  RULE_RE.lastIndex = 0;
  while ((m = RULE_RE.exec(content)) !== null) {
    const ruleName = m[1];
    // Content after the opening paren
    const afterParen = content.slice(m.index + m[0].length);
    const body = extractRuleBody(afterParen);

    const nameMatch = NAME_ATTR_RE.exec(body);
    if (!nameMatch) { continue; }

    const name = nameMatch[1];
    if (seen.has(name)) { continue; }
    seen.add(name);

    const kind = ruleName.endsWith('_test') ? 'test' : 'executable';
    const label = pkg === '//' ? `//:${name}` : `${pkg}:${name}`;

    targets.push({ name, label, kind, buildSystem: 'bazel' });
  }

  return targets;
}

/**
 * Compute the Bazel package label (e.g. "//src/order_book") from a file path.
 */
function getBazelPackage(filePath: string, workspaceRoot: string): string {
  const dir = path.dirname(filePath);
  const rel = path.relative(workspaceRoot, dir);
  if (!rel || rel === '.') {
    return '//';
  }
  return '//' + rel.replace(/\\/g, '/');
}

/**
 * Extract the body of a rule (content between the opening and matching closing paren).
 * `afterParen` starts right after the opening `(`.
 */
function extractRuleBody(afterParen: string): string {
  let depth = 1;
  let i = 0;
  while (i < afterParen.length && depth > 0) {
    const ch = afterParen[i];
    if (ch === '(') { depth++; }
    else if (ch === ')') { depth--; }
    i++;
  }
  return afterParen.slice(0, i - 1);
}
