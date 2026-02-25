// Mock child_process.spawn so buildTarget doesn't try to run cmake
jest.mock('child_process', () => ({ spawn: jest.fn() }));
// Mock CMake discovery
jest.mock('../../../build/cmake/discovery', () => ({
  discoverCMakeTargets: jest.fn().mockResolvedValue([]),
  resolveCMakeBinaryPath: jest.fn().mockReturnValue('/build/myapp'),
}));

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { CMakeBuildProvider } from '../../../build/cmake/provider';
import type { RunConfig } from '../../../model/config';

const mockSpawn = spawn as jest.Mock;

/** Create a fake child process that emits 'close' with exitCode. */
function makeFakeProc(exitCode: number) {
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  (proc as unknown as Record<string, unknown>)['stdout'] = new EventEmitter();
  (proc as unknown as Record<string, unknown>)['stderr'] = new EventEmitter();
  setTimeout(() => proc.emit('close', exitCode), 0);
  return proc;
}

const WORKSPACE = '/workspace';

function makeRC(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'cfg-test',
    name: 'My App',
    buildSystem: 'cmake',
    runMode: 'run',
    target: 'myapp',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CMakeBuildProvider.buildRunCommand
// ---------------------------------------------------------------------------

describe('CMakeBuildProvider.buildRunCommand', () => {
  const provider = new CMakeBuildProvider(WORKSPACE);

  it('returns a command containing the binary path', () => {
    const cmd = provider.buildRunCommand(makeRC(), '/build/myapp');
    expect(cmd).toContain('/build/myapp');
  });

  it('prepends source scripts', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ sourceScripts: ['./env.sh'] }),
      '/build/myapp',
    );
    expect(cmd).toMatch(/^\. \.\/env\.sh && /);
  });

  it('prepends env vars', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ env: { FOO: 'bar' } }),
      '/build/myapp',
    );
    expect(cmd).toContain('FOO=bar');
  });

  it('appends binary args', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ args: ['--verbose', '--port', '9090'] }),
      '/build/myapp',
    );
    expect(cmd).toContain('--verbose');
    expect(cmd).toContain('--port');
    expect(cmd).toContain('9090');
  });

  it('shell-quotes args containing spaces', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ args: ['hello world'] }),
      '/build/myapp',
    );
    expect(cmd).toContain("'hello world'");
  });
});

// ---------------------------------------------------------------------------
// CMakeBuildProvider.buildTestCommand
// ---------------------------------------------------------------------------

describe('CMakeBuildProvider.buildTestCommand', () => {
  const provider = new CMakeBuildProvider(WORKSPACE);

  it('starts with ctest', () => {
    const cmd = provider.buildTestCommand(makeRC());
    expect(cmd).toContain('ctest');
  });

  it('includes --output-on-failure', () => {
    const cmd = provider.buildTestCommand(makeRC());
    expect(cmd).toContain('--output-on-failure');
  });

  it('filters by target name with -R', () => {
    const cmd = provider.buildTestCommand(makeRC({ target: 'myapp_tests' }));
    expect(cmd).toContain('-R');
    expect(cmd).toContain('myapp_tests');
  });

  it('includes the build directory with --test-dir', () => {
    const cmd = provider.buildTestCommand(makeRC());
    expect(cmd).toContain('--test-dir');
    expect(cmd).toContain('/workspace/build');
  });

  it('uses preset-based build dir when buildConfig is set', () => {
    const cmd = provider.buildTestCommand(makeRC({ buildConfig: 'debug' }));
    expect(cmd).toContain('debug');
  });
});

// ---------------------------------------------------------------------------
// CMakeBuildProvider.buildCoverageCommand
// ---------------------------------------------------------------------------

describe('CMakeBuildProvider.buildCoverageCommand', () => {
  const provider = new CMakeBuildProvider(WORKSPACE);

  it('returns a command that runs the binary', () => {
    const cmd = provider.buildCoverageCommand(makeRC(), '/build/myapp', '/out/coverage');
    expect(cmd).toContain('/build/myapp');
  });

  it('includes gcovr', () => {
    const cmd = provider.buildCoverageCommand(makeRC(), '/build/myapp', '/out/coverage');
    expect(cmd).toContain('gcovr');
  });

  it('includes --html-details', () => {
    const cmd = provider.buildCoverageCommand(makeRC(), '/build/myapp', '/out/coverage');
    expect(cmd).toContain('--html-details');
  });

  it('specifies the output file ending in coverage.html', () => {
    const cmd = provider.buildCoverageCommand(makeRC(), '/build/myapp', '/out/coverage');
    expect(cmd).toContain('coverage.html');
  });

  it('specifies the workspace root with -r', () => {
    const cmd = provider.buildCoverageCommand(makeRC(), '/build/myapp', '/out/coverage');
    expect(cmd).toContain('-r');
    expect(cmd).toContain(WORKSPACE);
  });

  it('joins binary and gcovr with &&', () => {
    const cmd = provider.buildCoverageCommand(makeRC(), '/build/myapp', '/out/coverage');
    expect(cmd).toContain('&&');
    const parts = cmd.split('&&').map((s) => s.trim());
    expect(parts[0]).toContain('/build/myapp');
    expect(parts[1]).toContain('gcovr');
  });

  it('appends binary args', () => {
    const cmd = provider.buildCoverageCommand(
      makeRC({ args: ['--input', 'data.csv'] }),
      '/build/myapp',
      '/out/coverage',
    );
    expect(cmd).toContain('--input');
    expect(cmd).toContain('data.csv');
  });

  it('shell-quotes the output path when it contains spaces', () => {
    const cmd = provider.buildCoverageCommand(
      makeRC(),
      '/build/myapp',
      '/out/my coverage',
    );
    // The path should be quoted
    expect(cmd).toContain("'");
  });
});

// ---------------------------------------------------------------------------
// CMakeBuildProvider.buildTarget
// ---------------------------------------------------------------------------

describe('CMakeBuildProvider.buildTarget', () => {
  afterEach(() => mockSpawn.mockReset());

  it('resolves with success: true on exit code 0', async () => {
    mockSpawn.mockReturnValue(makeFakeProc(0));
    const provider = new CMakeBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const result = await provider.buildTarget(makeRC(), output);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('resolves with success: false on non-zero exit code', async () => {
    mockSpawn.mockReturnValue(makeFakeProc(2));
    const provider = new CMakeBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const result = await provider.buildTarget(makeRC(), output);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
  });

  it('includes cmake build command in the result', async () => {
    mockSpawn.mockReturnValue(makeFakeProc(0));
    const provider = new CMakeBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const result = await provider.buildTarget(makeRC({ target: 'myapp' }), output);
    expect(result.command).toContain('cmake');
    expect(result.command).toContain('myapp');
  });

  it('resolves with failure when spawn emits error', async () => {
    const proc = new EventEmitter() as NodeJS.EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    (proc as unknown as Record<string, unknown>)['stdout'] = new EventEmitter();
    (proc as unknown as Record<string, unknown>)['stderr'] = new EventEmitter();
    mockSpawn.mockReturnValue(proc);
    const provider = new CMakeBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const resultPromise = provider.buildTarget(makeRC(), output);
    setTimeout(() => proc.emit('error', new Error('cmake not found')), 0);
    const result = await resultPromise;
    expect(result.success).toBe(false);
  });

  it('uses preset when buildConfig is set', async () => {
    mockSpawn.mockReturnValue(makeFakeProc(0));
    const provider = new CMakeBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    await provider.buildTarget(makeRC({ buildConfig: 'release' }), output);
    const spawnCall = mockSpawn.mock.calls[0];
    expect(spawnCall[1]).toContain('--preset');
    expect(spawnCall[1]).toContain('release');
  });
});
