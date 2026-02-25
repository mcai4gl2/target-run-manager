import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildAnalysisCommands } from '../../analysis/analyzer';
import type { RunConfig } from '../../model/config';
import type { BuildSystemProvider, OutputChannel } from '../../build/provider';

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

function makeProvider(binaryPath?: string): BuildSystemProvider {
  return {
    name: 'mock',
    discoverTargets: jest.fn().mockResolvedValue([]),
    resolveBinaryPath: jest.fn().mockResolvedValue(binaryPath),
    buildTarget: jest.fn().mockResolvedValue({ success: true, exitCode: 0, command: '' }),
    buildRunCommand: jest.fn().mockReturnValue(''),
    buildTestCommand: jest.fn().mockReturnValue(''),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trm-analyzer-'));
}

function makeConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'cfg-test',
    name: 'Test',
    buildSystem: 'cmake',
    runMode: 'analyze',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyzer', () => {
  let workspaceFolder: string;

  beforeEach(() => {
    workspaceFolder = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(workspaceFolder, { recursive: true });
  });

  it('throws when analyzeConfig is missing', async () => {
    const config = makeConfig(); // no analyzeConfig
    await expect(
      buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder }),
    ).rejects.toThrow(/analyzeConfig/);
  });

  it('throws when binary cannot be resolved', async () => {
    const config = makeConfig({
      analyzeConfig: { tool: 'valgrind', subTool: 'memcheck' },
    });
    await expect(
      buildAnalysisCommands(config, makeProvider(undefined), { workspaceFolder }),
    ).rejects.toThrow(/binary/i);
  });

  describe('binary resolution priority', () => {
    it('uses analyzeConfig.binaryOverride first', async () => {
      const config = makeConfig({
        binaryOverride: '/config/binary',
        analyzeConfig: { tool: 'valgrind', binaryOverride: '/analyze/binary' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/provider/binary'), { workspaceFolder });
      expect(result.command).toContain('/analyze/binary');
    });

    it('uses config.binaryOverride when analyzeConfig.binaryOverride is absent', async () => {
      const config = makeConfig({
        binaryOverride: '/config/binary',
        analyzeConfig: { tool: 'strace' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/provider/binary'), { workspaceFolder });
      expect(result.command).toContain('/config/binary');
    });

    it('uses provider.resolveBinaryPath as fallback', async () => {
      const config = makeConfig({
        analyzeConfig: { tool: 'strace' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/provider/binary'), { workspaceFolder });
      expect(result.command).toContain('/provider/binary');
    });
  });

  describe('valgrind dispatch', () => {
    it('returns a valgrind command', async () => {
      const config = makeConfig({
        analyzeConfig: { tool: 'valgrind', subTool: 'memcheck' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.command).toContain('valgrind');
      expect(result.command).toContain('--leak-check=full');
    });

    it('creates output directory on disk', async () => {
      const config = makeConfig({
        analyzeConfig: { tool: 'valgrind', subTool: 'memcheck' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(fs.existsSync(result.outputDir)).toBe(true);
    });

    it('includes correct terminalTitle', async () => {
      const config = makeConfig({
        name: 'My App',
        analyzeConfig: { tool: 'valgrind', subTool: 'callgrind' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.terminalTitle).toContain('valgrind');
      expect(result.terminalTitle).toContain('My App');
    });
  });

  describe('perf dispatch', () => {
    it('returns a perf command with post-process', async () => {
      const config = makeConfig({
        analyzeConfig: { tool: 'perf', subTool: 'record' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.command).toContain('perf record');
      expect(result.postProcess).toContain('flamegraph.pl');
    });

    it('uses flamegraphScript from options', async () => {
      const config = makeConfig({
        analyzeConfig: { tool: 'perf', subTool: 'record' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), {
        workspaceFolder,
        flamegraphScript: '/custom/flamegraph.pl',
      });
      expect(result.postProcess).toContain('/custom/flamegraph.pl');
    });
  });

  describe('custom postProcess override', () => {
    it('analyzeConfig.postProcess overrides tool-derived postProcess', async () => {
      const config = makeConfig({
        analyzeConfig: {
          tool: 'perf',
          subTool: 'record',
          postProcess: 'my-custom-post-process',
        },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.postProcess).toBe('my-custom-post-process');
    });
  });

  describe('source scripts prepended', () => {
    it('prepends source scripts to command', async () => {
      const config = makeConfig({
        sourceScripts: ['./env/setup.sh'],
        analyzeConfig: { tool: 'strace' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.command).toMatch(/^\. \.\/env\/setup\.sh && /);
    });
  });

  describe('env vars prepended', () => {
    it('prepends env vars to command', async () => {
      const config = makeConfig({
        env: { MY_VAR: 'my_value' },
        analyzeConfig: { tool: 'strace' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.command).toContain('MY_VAR=my_value');
    });
  });

  describe('custom tool dispatch', () => {
    it('expands template placeholders', async () => {
      const config = makeConfig({
        args: ['--bench'],
        analyzeConfig: {
          tool: 'custom',
          customCommand: '/usr/bin/time -v {binary} {args} 2> {outputDir}/time.txt',
        },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.command).toContain('/usr/bin/time -v');
      expect(result.command).toContain('/bin/app');
      expect(result.command).toContain('--bench');
    });
  });

  describe('output dir handling', () => {
    it('uses analyzeConfig.outputDir when provided', async () => {
      const customOutDir = path.join(workspaceFolder, 'custom-out');
      const config = makeConfig({
        analyzeConfig: { tool: 'strace', outputDir: customOutDir },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.outputDir).toBe(customOutDir);
    });

    it('falls back to defaultOutputDir when outputDir not specified', async () => {
      const config = makeConfig({
        analyzeConfig: { tool: 'valgrind' },
      });
      const result = await buildAnalysisCommands(config, makeProvider('/bin/app'), { workspaceFolder });
      expect(result.outputDir).toContain('out');
      expect(result.outputDir).toContain('analysis');
    });
  });
});
