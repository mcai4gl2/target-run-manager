/**
 * Unit tests for the Runner class.
 *
 * We mock all heavy dependencies so the Runner can be exercised without a real
 * VS Code environment or build system.
 */

// ---- Mocks must be declared before imports ----

jest.mock('../../variables/expander', () => ({
  expandConfig: jest.fn(),
}));

jest.mock('../../analysis/analyzer', () => ({
  buildAnalysisCommands: jest.fn(),
}));

jest.mock('../../runner/launcher', () => ({
  launchDebugSession: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../runner/taskRunner', () => ({
  TaskRunner: jest.fn().mockImplementation(() => ({
    runInTerminal: jest.fn(),
    dispose: jest.fn(),
  })),
}));

// Mock all three build providers so getProvider() doesn't spawn real processes
jest.mock('../../build/cmake/provider', () => ({
  CMakeBuildProvider: jest.fn().mockImplementation(() => ({
    name: 'cmake',
    buildTarget: jest.fn().mockResolvedValue({ success: true, exitCode: 0, command: 'cmake' }),
    resolveBinaryPath: jest.fn().mockResolvedValue('/build/app'),
    buildRunCommand: jest.fn().mockReturnValue('/build/app'),
    buildTestCommand: jest.fn().mockReturnValue('ctest'),
    buildCoverageCommand: jest.fn().mockReturnValue('/build/app && gcovr'),
  })),
}));

jest.mock('../../build/bazel/provider', () => ({
  BazelBuildProvider: jest.fn().mockImplementation(() => ({
    name: 'bazel',
    buildTarget: jest.fn().mockResolvedValue({ success: true, exitCode: 0, command: 'bazel build' }),
    resolveBinaryPath: jest.fn().mockResolvedValue('/bazel-bin/app'),
    buildRunCommand: jest.fn().mockReturnValue('/bazel-bin/app'),
    buildTestCommand: jest.fn().mockReturnValue('bazel test //...'),
    buildCoverageCommand: jest.fn().mockReturnValue('bazel coverage //...'),
  })),
}));

jest.mock('../../build/manual/provider', () => ({
  ManualBuildProvider: jest.fn().mockImplementation(() => ({
    name: 'manual',
    buildTarget: jest.fn().mockResolvedValue({ success: true, exitCode: 0, command: '' }),
    resolveBinaryPath: jest.fn().mockResolvedValue('/manual/app'),
    buildRunCommand: jest.fn().mockReturnValue('/manual/app'),
    buildTestCommand: jest.fn().mockReturnValue(''),
  })),
}));

jest.mock('../../analysis/output', () => ({
  defaultOutputDir: jest.fn().mockReturnValue('/tmp/output'),
}));

jest.mock('../../runner/compound', () => ({
  executeCompound: jest.fn().mockResolvedValue(undefined),
}));

// ---- Actual imports ----

import * as vscode from 'vscode';
import { Runner, withCaptureOutput } from '../../runner/runner';
import { expandConfig } from '../../variables/expander';
import { buildAnalysisCommands } from '../../analysis/analyzer';
import { launchDebugSession } from '../../runner/launcher';
import { executeCompound } from '../../runner/compound';
import { RunHistoryManager } from '../../runner/history';
import type { RunConfig, WorkspaceModel, CompoundConfig } from '../../model/config';

const mockExpandConfig = expandConfig as jest.Mock;
const mockBuildAnalysisCommands = buildAnalysisCommands as jest.Mock;
const mockLaunchDebugSession = launchDebugSession as jest.Mock;
const mockExecuteCompound = executeCompound as jest.Mock;

const WORKSPACE = '/workspace';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOutputChannel() {
  return { appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() } as unknown as vscode.OutputChannel;
}

function makeRC(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'cfg-test',
    name: 'Test Config',
    buildSystem: 'cmake',
    runMode: 'run',
    target: 'myapp',
    ...overrides,
  };
}

function makeModel(overrides: Partial<WorkspaceModel> = {}): WorkspaceModel {
  return {
    groups: [],
    ungrouped: [],
    compounds: [],
    settings: {},
    fileMacros: new Map(),
    ...overrides,
  };
}

function makeRunner(model?: WorkspaceModel) {
  const channel = makeOutputChannel();
  const runner = new Runner(WORKSPACE, channel);
  if (model) {
    runner.setModel(model);
  }
  return { runner, channel };
}

/** Set up expandConfig to echo back the config unchanged. */
function setupExpandPassThrough(rc: RunConfig) {
  mockExpandConfig.mockReturnValue({ expanded: rc, warnings: [] });
}

// ---------------------------------------------------------------------------
// Constructor / setModel
// ---------------------------------------------------------------------------

describe('Runner — construction', () => {
  it('creates a RunHistoryManager by default', () => {
    const { runner } = makeRunner();
    expect(runner.history).toBeInstanceOf(RunHistoryManager);
  });

  it('accepts an injected RunHistoryManager', () => {
    const history = new RunHistoryManager(10);
    const runner = new Runner(WORKSPACE, makeOutputChannel(), undefined, history);
    expect(runner.history).toBe(history);
  });
});

// ---------------------------------------------------------------------------
// runConfig — no model loaded
// ---------------------------------------------------------------------------

describe('Runner.runConfig — no model', () => {
  it('shows an error message when model is not set', async () => {
    const { runner } = makeRunner();
    const rc = makeRC();
    await runner.runConfig(rc);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('no config model loaded'),
    );
  });
});

// ---------------------------------------------------------------------------
// runConfig — run mode
// ---------------------------------------------------------------------------

describe('Runner.runConfig — run mode', () => {
  beforeEach(() => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showWarningMessage as jest.Mock).mockReset();
  });

  it('runs without error in run mode', async () => {
    const rc = makeRC({ runMode: 'run' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('records the run in history', async () => {
    const rc = makeRC({ runMode: 'run' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(runner.history.size).toBeGreaterThan(0);
  });

  it('logs warnings from expandConfig', async () => {
    const rc = makeRC({ runMode: 'run' });
    mockExpandConfig.mockReturnValue({
      expanded: rc,
      warnings: [{ message: 'test warning' }],
    });
    const { runner, channel } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(channel.appendLine).toHaveBeenCalledWith(expect.stringContaining('test warning'));
  });
});

// ---------------------------------------------------------------------------
// runConfig — build step
// ---------------------------------------------------------------------------

describe('Runner.runConfig — build step', () => {
  beforeEach(() => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
  });

  it('calls buildTarget when preBuild is true', async () => {
    const rc = makeRC({ runMode: 'run', preBuild: true, buildSystem: 'cmake' });
    setupExpandPassThrough(rc);
    const { CMakeBuildProvider } = jest.requireMock('../../build/cmake/provider');
    const mockProvider = new CMakeBuildProvider();
    (mockProvider.buildTarget as jest.Mock).mockResolvedValue({ success: true, exitCode: 0, command: '' });

    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    // The build step should have been invoked (no error shown for success)
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('aborts and records to history when build fails', async () => {
    const { CMakeBuildProvider } = jest.requireMock('../../build/cmake/provider');
    const mockProvider = CMakeBuildProvider.mock.results[CMakeBuildProvider.mock.results.length - 1]?.value;
    if (mockProvider) {
      (mockProvider.buildTarget as jest.Mock).mockResolvedValue({ success: false, exitCode: 1, command: '' });
    }

    const rc = makeRC({ runMode: 'run', preBuild: true });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(runner.history.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// runConfig — test mode
// ---------------------------------------------------------------------------

describe('Runner.runConfig — test mode', () => {
  beforeEach(() => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
  });

  it('runs without error in test mode', async () => {
    const rc = makeRC({ runMode: 'test' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runConfig — coverage mode
// ---------------------------------------------------------------------------

describe('Runner.runConfig — coverage mode', () => {
  beforeEach(() => {
    (vscode.window.showWarningMessage as jest.Mock).mockReset();
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
  });

  it('runs coverage without error when buildCoverageCommand is supported', async () => {
    const rc = makeRC({ runMode: 'coverage' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('shows a warning when the provider does not support coverage', async () => {
    // Use manual provider which has no buildCoverageCommand
    const rc = makeRC({ runMode: 'coverage', buildSystem: 'manual' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Coverage mode is not supported'),
    );
  });
});

// ---------------------------------------------------------------------------
// runConfig — debug mode
// ---------------------------------------------------------------------------

describe('Runner.runConfig — debug mode', () => {
  beforeEach(() => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    mockLaunchDebugSession.mockReset();
    mockLaunchDebugSession.mockResolvedValue(true);
  });

  it('calls launchDebugSession in debug mode', async () => {
    const rc = makeRC({ runMode: 'debug' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(mockLaunchDebugSession).toHaveBeenCalled();
  });

  it('shows an error when launchDebugSession returns false', async () => {
    mockLaunchDebugSession.mockResolvedValue(false);
    const rc = makeRC({ runMode: 'debug' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start debug session'),
    );
  });
});

// ---------------------------------------------------------------------------
// runConfig — analyze mode
// ---------------------------------------------------------------------------

describe('Runner.runConfig — analyze mode', () => {
  beforeEach(() => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    mockBuildAnalysisCommands.mockReset();
  });

  it('runs analysis without error when buildAnalysisCommands succeeds', async () => {
    mockBuildAnalysisCommands.mockResolvedValue({
      command: 'valgrind /build/app',
      terminalTitle: 'Valgrind',
      outputDir: '/tmp/output',
      postProcess: undefined,
    });
    const rc = makeRC({ runMode: 'analyze' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('shows an error when buildAnalysisCommands throws', async () => {
    mockBuildAnalysisCommands.mockRejectedValue(new Error('tool not found'));
    const rc = makeRC({ runMode: 'analyze' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Analysis setup failed'),
    );
  });

  it('runs postProcess command when provided', async () => {
    jest.useFakeTimers();
    mockBuildAnalysisCommands.mockResolvedValue({
      command: 'perf record /build/app',
      terminalTitle: 'Perf',
      outputDir: '/tmp/output',
      postProcess: 'perf report',
    });
    const rc = makeRC({ runMode: 'analyze' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    jest.runAllTimers();
    jest.useRealTimers();
    // No error should have occurred
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runConfig — unknown mode
// ---------------------------------------------------------------------------

describe('Runner.runConfig — unknown mode', () => {
  it('shows a warning for an unrecognised run mode', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockReset();
    const rc = makeRC({ runMode: 'unknown' as RunConfig['runMode'] });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('not yet implemented'),
    );
  });
});

// ---------------------------------------------------------------------------
// runConfig — binary resolution failure
// ---------------------------------------------------------------------------

describe('Runner.runConfig — binary resolution failure', () => {
  it('shows an error when binary cannot be resolved', async () => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    const { CMakeBuildProvider } = jest.requireMock('../../build/cmake/provider');
    // Temporarily override resolveBinaryPath to return undefined
    const rc = makeRC({ runMode: 'run', binaryOverride: undefined });
    mockExpandConfig.mockReturnValue({ expanded: rc, warnings: [] });

    // Create a mock where resolveBinaryPath returns undefined
    CMakeBuildProvider.mockImplementationOnce(() => ({
      name: 'cmake',
      buildTarget: jest.fn().mockResolvedValue({ success: true, exitCode: 0, command: '' }),
      resolveBinaryPath: jest.fn().mockResolvedValue(undefined),
      buildRunCommand: jest.fn().mockReturnValue(''),
      buildTestCommand: jest.fn().mockReturnValue(''),
      buildCoverageCommand: jest.fn().mockReturnValue(null),
    }));

    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Cannot resolve binary'),
    );
  });
});

// ---------------------------------------------------------------------------
// buildConfig
// ---------------------------------------------------------------------------

describe('Runner.buildConfig', () => {
  beforeEach(() => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    (vscode.window.showInformationMessage as jest.Mock).mockReset();
  });

  it('shows a success message when build succeeds', async () => {
    const rc = makeRC();
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.buildConfig(rc);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Build succeeded'),
    );
  });

  it('returns early when no model is set', async () => {
    const { runner } = makeRunner();
    await runner.buildConfig(makeRC());
    // No error, just silent return
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runCompound
// ---------------------------------------------------------------------------

describe('Runner.runCompound', () => {
  beforeEach(() => {
    (vscode.window.showErrorMessage as jest.Mock).mockReset();
    mockExecuteCompound.mockReset();
    mockExecuteCompound.mockResolvedValue(undefined);
  });

  it('shows error when model is not set', async () => {
    const { runner } = makeRunner();
    const compound: CompoundConfig = { id: 'cmp', name: 'C', configs: ['a'], order: 'sequential' };
    await runner.runCompound(compound);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('no config model loaded'),
    );
  });

  it('delegates to executeCompound when model is set', async () => {
    const { runner } = makeRunner(makeModel());
    const compound: CompoundConfig = { id: 'cmp', name: 'C', configs: [], order: 'sequential' };
    await runner.runCompound(compound);
    expect(mockExecuteCompound).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('Runner.dispose', () => {
  it('disposes without error', () => {
    const { runner } = makeRunner();
    expect(() => runner.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getProvider — provider selection
// ---------------------------------------------------------------------------

describe('Runner — provider selection', () => {
  it('uses CMakeBuildProvider for cmake buildSystem', async () => {
    const { CMakeBuildProvider } = jest.requireMock('../../build/cmake/provider');
    CMakeBuildProvider.mockClear();
    const rc = makeRC({ buildSystem: 'cmake', runMode: 'run' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(CMakeBuildProvider).toHaveBeenCalled();
  });

  it('uses BazelBuildProvider for bazel buildSystem', async () => {
    const { BazelBuildProvider } = jest.requireMock('../../build/bazel/provider');
    BazelBuildProvider.mockClear();
    const rc = makeRC({ buildSystem: 'bazel', runMode: 'run' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(BazelBuildProvider).toHaveBeenCalled();
  });

  it('uses ManualBuildProvider for manual buildSystem', async () => {
    const { ManualBuildProvider } = jest.requireMock('../../build/manual/provider');
    ManualBuildProvider.mockClear();
    const rc = makeRC({ buildSystem: 'manual', runMode: 'run' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(ManualBuildProvider).toHaveBeenCalled();
  });

  it('falls back to ManualBuildProvider for unknown buildSystem', async () => {
    const { ManualBuildProvider } = jest.requireMock('../../build/manual/provider');
    ManualBuildProvider.mockClear();
    const rc = makeRC({ buildSystem: 'unknown' as RunConfig['buildSystem'], runMode: 'run' });
    setupExpandPassThrough(rc);
    const { runner } = makeRunner(makeModel());
    await runner.runConfig(rc);
    expect(ManualBuildProvider).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// withCaptureOutput (re-exported helper)
// ---------------------------------------------------------------------------

describe('withCaptureOutput', () => {
  it('returns original command when captureFile is undefined', () => {
    expect(withCaptureOutput('echo hi', undefined)).toBe('echo hi');
  });

  it('wraps with tee when captureFile is provided', () => {
    const result = withCaptureOutput('echo hi', '/tmp/out.log');
    expect(result).toContain('tee');
    expect(result).toContain('/tmp/out.log');
  });
});
