import { ManualBuildProvider } from '../../../build/manual/provider';
import type { RunConfig } from '../../../model/config';

function makeRC(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'cfg-test',
    name: 'My App',
    buildSystem: 'manual',
    runMode: 'run',
    binaryOverride: '/usr/local/bin/myapp',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ManualBuildProvider.discoverTargets
// ---------------------------------------------------------------------------

describe('ManualBuildProvider.discoverTargets', () => {
  it('returns an empty array', async () => {
    const provider = new ManualBuildProvider();
    const targets = await provider.discoverTargets();
    expect(targets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ManualBuildProvider.refresh
// ---------------------------------------------------------------------------

describe('ManualBuildProvider.refresh', () => {
  it('resolves without error', async () => {
    const provider = new ManualBuildProvider();
    await expect(provider.refresh()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ManualBuildProvider.resolveBinaryPath
// ---------------------------------------------------------------------------

describe('ManualBuildProvider.resolveBinaryPath', () => {
  it('returns binaryOverride when set', async () => {
    const provider = new ManualBuildProvider();
    const result = await provider.resolveBinaryPath(makeRC({ binaryOverride: '/my/bin' }));
    expect(result).toBe('/my/bin');
  });

  it('returns undefined when binaryOverride is absent', async () => {
    const provider = new ManualBuildProvider();
    const result = await provider.resolveBinaryPath(makeRC({ binaryOverride: undefined }));
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ManualBuildProvider.buildTarget
// ---------------------------------------------------------------------------

describe('ManualBuildProvider.buildTarget', () => {
  it('always succeeds with exit code 0', async () => {
    const provider = new ManualBuildProvider();
    const output = { appendLine: jest.fn() };
    const result = await provider.buildTarget(makeRC(), output);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('logs a skip message to the output channel', async () => {
    const provider = new ManualBuildProvider();
    const output = { appendLine: jest.fn() };
    await provider.buildTarget(makeRC(), output);
    expect(output.appendLine).toHaveBeenCalledWith(expect.stringContaining('Manual'));
  });
});

// ---------------------------------------------------------------------------
// ManualBuildProvider.buildRunCommand
// ---------------------------------------------------------------------------

describe('ManualBuildProvider.buildRunCommand', () => {
  const provider = new ManualBuildProvider();

  it('returns a command containing the binary path', () => {
    const cmd = provider.buildRunCommand(makeRC(), '/usr/local/bin/myapp');
    expect(cmd).toContain('/usr/local/bin/myapp');
  });

  it('prepends source scripts', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ sourceScripts: ['./env.sh'] }),
      '/bin/app',
    );
    expect(cmd).toMatch(/^\. \.\/env\.sh && /);
  });

  it('prepends multiple source scripts', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ sourceScripts: ['./a.sh', './b.sh'] }),
      '/bin/app',
    );
    expect(cmd).toContain('. ./a.sh');
    expect(cmd).toContain('. ./b.sh');
  });

  it('prepends env vars', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ env: { LEVEL: 'debug' } }),
      '/bin/app',
    );
    expect(cmd).toContain('LEVEL=debug');
  });

  it('appends binary args', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ args: ['--config', '/path/to/cfg'] }),
      '/bin/app',
    );
    expect(cmd).toContain('--config');
    expect(cmd).toContain('/path/to/cfg');
  });

  it('shell-quotes args containing spaces', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ args: ['hello world'] }),
      '/bin/app',
    );
    expect(cmd).toContain("'hello world'");
  });

  it('shell-quotes env values containing spaces', () => {
    const cmd = provider.buildRunCommand(
      makeRC({ env: { PATH_VAR: '/dir with spaces/bin' } }),
      '/bin/app',
    );
    expect(cmd).toContain('PATH_VAR=');
    expect(cmd).toContain('dir with spaces');
  });

  it('does not add env prefix when env is empty', () => {
    const cmd = provider.buildRunCommand(makeRC({ env: {} }), '/bin/app');
    expect(cmd).toBe('/bin/app');
  });
});

// ---------------------------------------------------------------------------
// ManualBuildProvider.buildTestCommand
// ---------------------------------------------------------------------------

describe('ManualBuildProvider.buildTestCommand', () => {
  it('returns an empty string', () => {
    const provider = new ManualBuildProvider();
    const cmd = provider.buildTestCommand(makeRC());
    expect(cmd).toBe('');
  });
});
