// Mock child_process.spawn so buildTarget doesn't try to run bazel
jest.mock('child_process', () => ({ spawn: jest.fn() }));
// Mock discovery so discoverTargets doesn't need a real workspace
jest.mock('../../../build/bazel/discovery', () => ({
  discoverBazelTargets: jest.fn().mockResolvedValue([]),
  resolveBazelBinaryPath: jest.requireActual('../../../build/bazel/discovery').resolveBazelBinaryPath,
}));

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { buildBazelArgs, BazelBuildProvider } from '../../../build/bazel/provider';
import { discoverBazelTargets } from '../../../build/bazel/discovery';
import type { RunConfig } from '../../../model/config';

const mockSpawn = spawn as jest.Mock;
const mockDiscover = discoverBazelTargets as jest.Mock;

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
    name: 'My Bazel App',
    buildSystem: 'bazel',
    runMode: 'run',
    target: '//src/app:server',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildBazelArgs
// ---------------------------------------------------------------------------

describe('buildBazelArgs', () => {
  it('includes the verb as first non-startup arg', () => {
    const args = buildBazelArgs('build', makeRC());
    expect(args).toContain('build');
  });

  it('places startup flags before the verb', () => {
    const args = buildBazelArgs('build', makeRC({
      bazel: { startupFlags: ['--output_base=/tmp/bazel'] },
    }));
    const verbIdx = args.indexOf('build');
    const startupIdx = args.indexOf('--output_base=/tmp/bazel');
    expect(startupIdx).toBeLessThan(verbIdx);
  });

  it('includes --config=<buildConfig>', () => {
    const args = buildBazelArgs('build', makeRC({ buildConfig: 'opt' }));
    expect(args).toContain('--config=opt');
  });

  it('includes the target label', () => {
    const args = buildBazelArgs('build', makeRC({ target: '//src/app:server' }));
    expect(args).toContain('//src/app:server');
  });

  it('appends extraBuildFlags', () => {
    const args = buildBazelArgs('build', makeRC({
      bazel: { extraBuildFlags: ['--copt=-O0'] },
    }));
    expect(args).toContain('--copt=-O0');
  });

  it('includes --test_output=all for test verb', () => {
    const args = buildBazelArgs('test', makeRC({ runMode: 'test' }));
    expect(args).toContain('--test_output=all');
  });

  it('includes --test_filter when set', () => {
    const args = buildBazelArgs('test', makeRC({
      runMode: 'test',
      bazel: { testFilter: 'MyTest*' },
    }));
    expect(args).toContain('--test_filter=MyTest*');
  });

  it('does not include --test_filter when absent', () => {
    const args = buildBazelArgs('test', makeRC({ runMode: 'test' }));
    expect(args.join(' ')).not.toContain('--test_filter');
  });

  it('includes --run_under for run verb when set', () => {
    const args = buildBazelArgs('run', makeRC({
      bazel: { runUnder: 'valgrind' },
    }));
    expect(args).toContain('--run_under=valgrind');
  });

  it('does not include --run_under for build verb', () => {
    const args = buildBazelArgs('build', makeRC({
      bazel: { runUnder: 'valgrind' },
    }));
    expect(args.join(' ')).not.toContain('--run_under');
  });

  it('appends -- and args for run verb when args are set', () => {
    const args = buildBazelArgs('run', makeRC({ args: ['--port', '8080'] }));
    const sepIdx = args.indexOf('--');
    expect(sepIdx).toBeGreaterThan(-1);
    expect(args.slice(sepIdx + 1)).toEqual(['--port', '8080']);
  });

  it('does not append -- for run verb when args are empty', () => {
    const args = buildBazelArgs('run', makeRC({ args: [] }));
    expect(args).not.toContain('--');
  });

  it('does not append args for build verb', () => {
    const args = buildBazelArgs('build', makeRC({ args: ['--port', '8080'] }));
    expect(args).not.toContain('--port');
  });
});

// ---------------------------------------------------------------------------
// BazelBuildProvider.buildRunCommand
// ---------------------------------------------------------------------------

describe('BazelBuildProvider.buildRunCommand', () => {
  const provider = new BazelBuildProvider(WORKSPACE);

  it('runs the binary directly when no runUnder is set', () => {
    const cmd = provider.buildRunCommand(makeRC(), '/workspace/bazel-bin/src/app/server');
    expect(cmd).toContain('/workspace/bazel-bin/src/app/server');
    expect(cmd).not.toContain('bazel run');
  });

  it('uses bazel run when runUnder is set', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ bazel: { runUnder: 'valgrind' } }),
      '/workspace/bazel-bin/src/app/server',
    );
    expect(cmd).toContain('bazel');
    expect(cmd).toContain('run');
    expect(cmd).toContain('--run_under=valgrind');
  });

  it('prepends source scripts', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ sourceScripts: ['./env.sh'] }),
      '/bin/app',
    );
    expect(cmd).toMatch(/^\. \.\/env\.sh && /);
  });

  it('prepends env vars', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ env: { MY_VAR: 'hello' } }),
      '/bin/app',
    );
    expect(cmd).toContain('MY_VAR=hello');
  });

  it('appends binary args', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ args: ['--port', '8080'] }),
      '/bin/app',
    );
    expect(cmd).toContain('--port');
    expect(cmd).toContain('8080');
  });

  it('shell-quotes env values that contain spaces', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ env: { MY_PATH: '/dir with spaces/bin' } }),
      '/bin/app',
    );
    expect(cmd).toContain("MY_PATH=");
    expect(cmd).toContain("dir with spaces");
  });
});

// ---------------------------------------------------------------------------
// BazelBuildProvider.buildTestCommand
// ---------------------------------------------------------------------------

describe('BazelBuildProvider.buildTestCommand', () => {
  const provider = new BazelBuildProvider(WORKSPACE);

  it('starts with bazel test', () => {
    const cmd = provider.buildTestCommand(makeRC({ runMode: 'test' }));
    expect(cmd).toMatch(/^bazel(\s+\S+)?\s+test/);
  });

  it('includes the target label', () => {
    const cmd = provider.buildTestCommand(makeRC({ target: '//src/...' }));
    expect(cmd).toContain('//src/...');
  });

  it('includes --test_output=all', () => {
    const cmd = provider.buildTestCommand(makeRC({ runMode: 'test' }));
    expect(cmd).toContain('--test_output=all');
  });

  it('includes --test_filter when set', () => {
    const cmd = provider.buildTestCommand(
      makeRC({ runMode: 'test', bazel: { testFilter: 'Foo*' } }),
    );
    expect(cmd).toContain('--test_filter=Foo*');
  });

  it('includes --config when buildConfig is set', () => {
    const cmd = provider.buildTestCommand(makeRC({ buildConfig: 'dbg' }));
    expect(cmd).toContain('--config=dbg');
  });
});

// ---------------------------------------------------------------------------
// BazelBuildProvider.resolveBinaryPath
// ---------------------------------------------------------------------------

describe('BazelBuildProvider.resolveBinaryPath', () => {
  const provider = new BazelBuildProvider(WORKSPACE);

  it('returns bazel-bin path for a valid label', async () => {
    const result = await provider.resolveBinaryPath(makeRC({ target: '//src/app:server' }));
    expect(result).toContain('bazel-bin');
    expect(result).toContain('src/app');
    expect(result).toContain('server');
  });

  it('returns undefined when no target is set', async () => {
    const result = await provider.resolveBinaryPath(makeRC({ target: undefined }));
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BazelBuildProvider.discoverTargets + refresh
// ---------------------------------------------------------------------------

describe('BazelBuildProvider.discoverTargets', () => {
  beforeEach(() => mockDiscover.mockReset());

  it('returns discovered targets from discoverBazelTargets', async () => {
    const fakeTargets = [{ name: '//a:b', label: '//a:b', kind: 'executable' as const, buildSystem: 'bazel' as const }];
    mockDiscover.mockResolvedValue(fakeTargets);
    const provider = new BazelBuildProvider(WORKSPACE);
    const result = await provider.discoverTargets();
    expect(result).toEqual(fakeTargets);
  });

  it('caches results on second call', async () => {
    mockDiscover.mockResolvedValue([]);
    const provider = new BazelBuildProvider(WORKSPACE);
    await provider.discoverTargets();
    await provider.discoverTargets();
    expect(mockDiscover).toHaveBeenCalledTimes(1);
  });

  it('re-discovers after refresh()', async () => {
    mockDiscover.mockResolvedValue([]);
    const provider = new BazelBuildProvider(WORKSPACE);
    await provider.discoverTargets();
    await provider.refresh();
    await provider.discoverTargets();
    expect(mockDiscover).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// BazelBuildProvider.buildTarget
// ---------------------------------------------------------------------------

describe('BazelBuildProvider.buildTarget', () => {
  afterEach(() => mockSpawn.mockReset());

  it('resolves with success: true on exit code 0', async () => {
    mockSpawn.mockReturnValue(makeFakeProc(0));
    const provider = new BazelBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const result = await provider.buildTarget(makeRC(), output);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('resolves with success: false on non-zero exit code', async () => {
    mockSpawn.mockReturnValue(makeFakeProc(1));
    const provider = new BazelBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const result = await provider.buildTarget(makeRC(), output);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('includes the bazel build command in the result', async () => {
    mockSpawn.mockReturnValue(makeFakeProc(0));
    const provider = new BazelBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const result = await provider.buildTarget(makeRC({ target: '//src/app:server' }), output);
    expect(result.command).toContain('build');
    expect(result.command).toContain('//src/app:server');
  });

  it('resolves with failure when spawn emits error', async () => {
    const proc = new EventEmitter() as NodeJS.EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    (proc as unknown as Record<string, unknown>)['stdout'] = new EventEmitter();
    (proc as unknown as Record<string, unknown>)['stderr'] = new EventEmitter();
    mockSpawn.mockReturnValue(proc);
    const provider = new BazelBuildProvider(WORKSPACE);
    const output = { appendLine: jest.fn() };
    const resultPromise = provider.buildTarget(makeRC(), output);
    setTimeout(() => proc.emit('error', new Error('spawn failed')), 0);
    const result = await resultPromise;
    expect(result.success).toBe(false);
  });
});
