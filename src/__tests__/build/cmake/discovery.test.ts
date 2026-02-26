/**
 * Tests for resolveCMakeBinaryPath — File API path and filesystem fallback.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fileApi at the top level so Jest hoists it correctly.
// Default: parseReply returns [] (no reply available) — this exercises the fallback.
// Individual tests can override via mockReturnValue.
jest.mock('../../../build/cmake/fileApi', () => ({
  parseReply: jest.fn().mockReturnValue([]),
  writeQueryFile: jest.fn(),
  hasReply: jest.fn().mockReturnValue(false),
}));

import { resolveCMakeBinaryPath } from '../../../build/cmake/discovery';
import { parseReply } from '../../../build/cmake/fileApi';

const mockParseReply = parseReply as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trm-cmake-test-'));
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeExecutable(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '#!/bin/sh\n');
  fs.chmodSync(filePath, 0o755);
}

function makeNonExecutable(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'data');
  fs.chmodSync(filePath, 0o644);
}

// ---------------------------------------------------------------------------
// Filesystem fallback (parseReply returns [] — no File API reply available)
// ---------------------------------------------------------------------------

describe('resolveCMakeBinaryPath — filesystem fallback', () => {
  let buildDir: string;

  beforeEach(() => {
    buildDir = makeTmpDir();
    mockParseReply.mockReturnValue([]);
  });

  afterEach(() => {
    rmrf(buildDir);
  });

  it('returns the binary when it sits at the root of the build dir', () => {
    makeExecutable(path.join(buildDir, 'myapp'));
    expect(resolveCMakeBinaryPath(buildDir, 'myapp')).toBe(path.join(buildDir, 'myapp'));
  });

  it('returns the binary when it is nested in a subdirectory', () => {
    makeExecutable(path.join(buildDir, 'src', 'server', 'myapp'));
    expect(resolveCMakeBinaryPath(buildDir, 'myapp')).toBe(
      path.join(buildDir, 'src', 'server', 'myapp'),
    );
  });

  it('returns undefined when the binary does not exist', () => {
    expect(resolveCMakeBinaryPath(buildDir, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined when a file with the target name exists but is not executable', () => {
    makeNonExecutable(path.join(buildDir, 'myapp'));
    expect(resolveCMakeBinaryPath(buildDir, 'myapp')).toBeUndefined();
  });

  it('skips CMakeFiles directory during search', () => {
    makeExecutable(path.join(buildDir, 'CMakeFiles', 'myapp'));
    expect(resolveCMakeBinaryPath(buildDir, 'myapp')).toBeUndefined();
  });

  it('skips .cmake directory during search', () => {
    makeExecutable(path.join(buildDir, '.cmake', 'myapp'));
    expect(resolveCMakeBinaryPath(buildDir, 'myapp')).toBeUndefined();
  });

  it('skips _deps directory during search', () => {
    makeExecutable(path.join(buildDir, '_deps', 'some-lib', 'myapp'));
    expect(resolveCMakeBinaryPath(buildDir, 'myapp')).toBeUndefined();
  });

  it('finds the real binary when a skipped dir also contains a same-named non-executable', () => {
    makeNonExecutable(path.join(buildDir, 'CMakeFiles', 'myapp'));
    makeExecutable(path.join(buildDir, 'bin', 'myapp'));
    expect(resolveCMakeBinaryPath(buildDir, 'myapp')).toBe(path.join(buildDir, 'bin', 'myapp'));
  });

  it('returns undefined when the build directory does not exist', () => {
    expect(resolveCMakeBinaryPath('/nonexistent/build/dir', 'myapp')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// File API reply takes precedence over filesystem search
// ---------------------------------------------------------------------------

describe('resolveCMakeBinaryPath — File API reply takes precedence', () => {
  it('returns the File API path when the reply contains the target', () => {
    mockParseReply.mockReturnValue([
      { name: 'myapp', kind: 'executable', binaryPath: 'bin/myapp', buildSystem: 'cmake' },
    ]);
    expect(resolveCMakeBinaryPath('/some/build', 'myapp')).toBe(
      path.resolve('/some/build', 'bin/myapp'),
    );
  });

  it('falls back to filesystem when the reply does not contain the target', () => {
    mockParseReply.mockReturnValue([
      { name: 'other', kind: 'executable', binaryPath: 'bin/other', buildSystem: 'cmake' },
    ]);
    // No filesystem binary either → undefined
    expect(resolveCMakeBinaryPath('/nonexistent/build', 'myapp')).toBeUndefined();
  });
});
