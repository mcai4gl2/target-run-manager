jest.mock('child_process', () => ({ execSync: jest.fn() }));

import {
  parseBazelLabel,
  isValidBazelLabel,
  parseBazelQueryOutput,
  runBazelQuery,
} from '../../../build/bazel/query';
import { execSync } from 'child_process';

const mockExecSync = execSync as jest.Mock;

// ---------------------------------------------------------------------------
// parseBazelLabel
// ---------------------------------------------------------------------------

describe('parseBazelLabel', () => {
  it('parses a full label //pkg:target', () => {
    const label = parseBazelLabel('//src/app:server');
    expect(label).not.toBeNull();
    expect(label!.package).toBe('src/app');
    expect(label!.target).toBe('server');
    expect(label!.workspace).toBe('');
  });

  it('parses a label with a nested package path', () => {
    const label = parseBazelLabel('//projects/order_book:main');
    expect(label!.package).toBe('projects/order_book');
    expect(label!.target).toBe('main');
  });

  it('parses label without explicit target (defaults to last pkg segment)', () => {
    const label = parseBazelLabel('//src/app');
    expect(label!.package).toBe('src/app');
    expect(label!.target).toBe('app');
  });

  it('parses top-level //: label', () => {
    const label = parseBazelLabel('//:my_target');
    expect(label!.package).toBe('');
    expect(label!.target).toBe('my_target');
  });

  it('parses label with workspace prefix @myws//pkg:target', () => {
    const label = parseBazelLabel('@myws//pkg:target');
    expect(label!.workspace).toBe('@myws');
    expect(label!.package).toBe('pkg');
    expect(label!.target).toBe('target');
  });

  it('sets canonical form without workspace prefix', () => {
    const label = parseBazelLabel('//src/app:server');
    expect(label!.canonical).toBe('//src/app:server');
  });

  it('sets canonical form with workspace prefix', () => {
    const label = parseBazelLabel('@ws//pkg:tgt');
    expect(label!.canonical).toBe('@ws//pkg:tgt');
  });

  it('returns null for a string without //', () => {
    expect(parseBazelLabel('not-a-label')).toBeNull();
  });

  it('returns null for empty target after colon', () => {
    expect(parseBazelLabel('//pkg:')).toBeNull();
  });

  it('trims surrounding whitespace before parsing', () => {
    const label = parseBazelLabel('  //src/app:server  ');
    expect(label).not.toBeNull();
    expect(label!.target).toBe('server');
  });
});

// ---------------------------------------------------------------------------
// isValidBazelLabel
// ---------------------------------------------------------------------------

describe('isValidBazelLabel', () => {
  it('returns true for a valid label', () => {
    expect(isValidBazelLabel('//src/app:server')).toBe(true);
  });

  it('returns true for a label without explicit target', () => {
    expect(isValidBazelLabel('//src/app')).toBe(true);
  });

  it('returns true for a workspace-prefixed label', () => {
    expect(isValidBazelLabel('@ws//pkg:tgt')).toBe(true);
  });

  it('returns false for plain strings without //', () => {
    expect(isValidBazelLabel('some-binary')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidBazelLabel('')).toBe(false);
  });

  it('returns false for labels with empty target after colon', () => {
    expect(isValidBazelLabel('//pkg:')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseBazelQueryOutput
// ---------------------------------------------------------------------------

describe('parseBazelQueryOutput', () => {
  it('splits output on newlines', () => {
    expect(parseBazelQueryOutput('//a:b\n//c:d\n')).toEqual(['//a:b', '//c:d']);
  });

  it('filters empty lines', () => {
    expect(parseBazelQueryOutput('\n\n//a:b\n\n')).toEqual(['//a:b']);
  });

  it('filters comment lines starting with #', () => {
    expect(parseBazelQueryOutput('# comment\n//a:b\n')).toEqual(['//a:b']);
  });

  it('returns empty array for empty output', () => {
    expect(parseBazelQueryOutput('')).toEqual([]);
  });

  it('trims whitespace from each line', () => {
    expect(parseBazelQueryOutput('  //a:b  \n')).toEqual(['//a:b']);
  });
});

// ---------------------------------------------------------------------------
// runBazelQuery
// ---------------------------------------------------------------------------

describe('runBazelQuery', () => {
  const WORKSPACE = '/workspace';

  afterEach(() => {
    mockExecSync.mockReset();
  });

  it('returns empty array when execSync throws', () => {
    mockExecSync.mockImplementation(() => { throw new Error('bazel not found'); });
    expect(runBazelQuery('//...', { workspaceRoot: WORKSPACE })).toEqual([]);
  });

  it('parses and returns labels from query output', () => {
    mockExecSync.mockReturnValue('//src/app:server\n//src/lib:util\n');
    const result = runBazelQuery('//...', { workspaceRoot: WORKSPACE });
    expect(result).toEqual(['//src/app:server', '//src/lib:util']);
  });

  it('passes workspaceRoot as cwd to execSync', () => {
    mockExecSync.mockReturnValue('');
    runBazelQuery('//...', { workspaceRoot: WORKSPACE });
    const [, opts] = mockExecSync.mock.calls[0];
    expect(opts.cwd).toBe(WORKSPACE);
  });

  it('includes startup flags in the command', () => {
    mockExecSync.mockReturnValue('');
    runBazelQuery('//...', {
      workspaceRoot: WORKSPACE,
      startupFlags: ['--output_base=/tmp/bazel'],
    });
    const [cmd] = mockExecSync.mock.calls[0];
    expect(cmd).toContain('--output_base=/tmp/bazel');
  });

  it('returns empty array for blank query output', () => {
    mockExecSync.mockReturnValue('\n\n');
    expect(runBazelQuery('//...', { workspaceRoot: WORKSPACE })).toEqual([]);
  });
});
