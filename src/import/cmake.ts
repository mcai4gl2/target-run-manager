/**
 * Parse CMakeLists.txt to find executable and test targets.
 */

import type { ParsedTarget } from './types';

// add_executable(name ...) — captures target name
const ADD_EXECUTABLE_RE = /\badd_executable\s*\(\s*([A-Za-z0-9_.-]+)/g;

// add_test(NAME name ...) — captures test name (NAME keyword form only)
const ADD_TEST_RE = /\badd_test\s*\(\s*NAME\s+([A-Za-z0-9_.-]+)/g;

/**
 * Extract all add_executable and add_test targets from CMakeLists.txt content.
 */
export function parseCMakeLists(content: string): ParsedTarget[] {
  const targets: ParsedTarget[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;

  ADD_EXECUTABLE_RE.lastIndex = 0;
  while ((m = ADD_EXECUTABLE_RE.exec(content)) !== null) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      targets.push({ name, label: name, kind: 'executable', buildSystem: 'cmake' });
    }
  }

  ADD_TEST_RE.lastIndex = 0;
  while ((m = ADD_TEST_RE.exec(content)) !== null) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      targets.push({ name, label: name, kind: 'test', buildSystem: 'cmake' });
    }
  }

  return targets;
}
