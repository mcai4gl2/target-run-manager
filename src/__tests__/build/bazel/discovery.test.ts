// Mock the query module so discovery tests don't require a real Bazel installation
jest.mock('../../../build/bazel/query', () => {
  const actual = jest.requireActual('../../../build/bazel/query');
  return {
    ...actual,
    runBazelQuery: jest.fn(),
  };
});

import { discoverBazelTargets, resolveBazelBinaryPath } from '../../../build/bazel/discovery';
import { runBazelQuery } from '../../../build/bazel/query';
import * as path from 'path';

const mockRunQuery = runBazelQuery as jest.Mock;
const WORKSPACE = '/workspace';

afterEach(() => {
  mockRunQuery.mockReset();
});

// ---------------------------------------------------------------------------
// discoverBazelTargets
// ---------------------------------------------------------------------------

describe('discoverBazelTargets', () => {
  it('returns empty array when both queries return nothing', async () => {
    mockRunQuery.mockReturnValue([]);
    const targets = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(targets).toEqual([]);
  });

  it('maps binary labels to executable BuildTargets', async () => {
    mockRunQuery
      .mockReturnValueOnce(['//src/app:server'])   // binary query
      .mockReturnValueOnce([]);                     // test query
    const targets = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(targets).toHaveLength(1);
    expect(targets[0].kind).toBe('executable');
    expect(targets[0].label).toBe('//src/app:server');
    expect(targets[0].buildSystem).toBe('bazel');
  });

  it('maps test labels to test BuildTargets', async () => {
    mockRunQuery
      .mockReturnValueOnce([])                       // binary query
      .mockReturnValueOnce(['//src/lib:my_test']);    // test query
    const targets = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(targets).toHaveLength(1);
    expect(targets[0].kind).toBe('test');
  });

  it('deduplicates labels appearing in both binary and test queries', async () => {
    mockRunQuery
      .mockReturnValueOnce(['//src/app:main'])
      .mockReturnValueOnce(['//src/app:main']);
    const targets = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(targets).toHaveLength(1);
  });

  it('uses bazel-bin convention for binaryPath', async () => {
    mockRunQuery
      .mockReturnValueOnce(['//src/app:server'])
      .mockReturnValueOnce([]);
    const [target] = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(target.binaryPath).toContain('bazel-bin');
    expect(target.binaryPath).toContain('src/app');
    expect(target.binaryPath).toContain('server');
  });

  it('skips labels that cannot be parsed', async () => {
    mockRunQuery
      .mockReturnValueOnce(['not-a-label', '//src/app:server'])
      .mockReturnValueOnce([]);
    const targets = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(targets).toHaveLength(1);
    expect(targets[0].label).toBe('//src/app:server');
  });

  it('combines binary and test results without overlap', async () => {
    mockRunQuery
      .mockReturnValueOnce(['//src/app:server'])
      .mockReturnValueOnce(['//src/lib:unit_test']);
    const targets = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(targets).toHaveLength(2);
  });

  it('deduplicates repeated labels within the binary query', async () => {
    mockRunQuery
      .mockReturnValueOnce(['//src/app:server', '//src/app:server'])
      .mockReturnValueOnce([]);
    const targets = await discoverBazelTargets({ workspaceRoot: WORKSPACE });
    expect(targets).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resolveBazelBinaryPath
// ---------------------------------------------------------------------------

describe('resolveBazelBinaryPath', () => {
  it('resolves to <workspaceRoot>/bazel-bin/<package>/<target>', () => {
    const result = resolveBazelBinaryPath('//src/app:server', WORKSPACE);
    expect(result).toBe(path.join(WORKSPACE, 'bazel-bin', 'src/app', 'server'));
  });

  it('handles nested packages', () => {
    const result = resolveBazelBinaryPath('//a/b/c:my_binary', WORKSPACE);
    expect(result).toBe(path.join(WORKSPACE, 'bazel-bin', 'a/b/c', 'my_binary'));
  });

  it('returns undefined for an invalid label', () => {
    expect(resolveBazelBinaryPath('not-a-label', WORKSPACE)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(resolveBazelBinaryPath('', WORKSPACE)).toBeUndefined();
  });
});
