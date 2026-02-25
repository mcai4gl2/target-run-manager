import { buildDebugConfig, launchDebugSession } from '../../runner/launcher';
import type { RunConfig } from '../../model/config';

// vscode mock is auto-resolved via jest moduleNameMapper
const vscode = require('vscode');

const BINARY = '/build/debug/my_app';
const WORKSPACE = '/workspace';

function makeRC(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'cfg-test',
    name: 'My App',
    buildSystem: 'cmake',
    runMode: 'debug',
    ...overrides,
  };
}

describe('buildDebugConfig', () => {
  it('sets type to cppdbg and request to launch', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.type).toBe('cppdbg');
    expect(cfg.request).toBe('launch');
  });

  it('sets program to the resolved binary path', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.program).toBe(BINARY);
  });

  it('sets name derived from config name', () => {
    const cfg = buildDebugConfig(makeRC({ name: 'Order Book' }), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.name).toContain('Order Book');
  });

  it('passes args from config', () => {
    const cfg = buildDebugConfig(makeRC({ args: ['--mode', 'sim'] }), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.args).toEqual(['--mode', 'sim']);
  });

  it('defaults to empty args when config.args is absent', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.args).toEqual([]);
  });

  it('uses config.cwd when provided', () => {
    const cfg = buildDebugConfig(makeRC({ cwd: '/custom/cwd' }), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.cwd).toBe('/custom/cwd');
  });

  it('falls back to workspaceFolder for cwd', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.cwd).toBe(WORKSPACE);
  });

  it('maps env record to name/value array', () => {
    const cfg = buildDebugConfig(
      makeRC({ env: { MY_VAR: 'hello', OTHER: 'world' } }),
      BINARY,
      { workspaceFolder: WORKSPACE },
    );
    expect(cfg.environment).toContainEqual({ name: 'MY_VAR', value: 'hello' });
    expect(cfg.environment).toContainEqual({ name: 'OTHER', value: 'world' });
  });

  it('produces empty environment array when no env is set', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.environment).toEqual([]);
  });

  it('defaults to gdb MIMode', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.MIMode).toBe('gdb');
  });

  it('uses provided miMode lldb', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE, miMode: 'lldb' });
    expect(cfg.MIMode).toBe('lldb');
  });

  it('includes a pretty-printing setup command', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    const commands = cfg.setupCommands as Array<{ text: string }>;
    expect(commands.some((c) => c.text.includes('-enable-pretty-printing'))).toBe(true);
  });

  it('sets stopAtEntry when specified', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE, stopAtEntry: true });
    expect(cfg.stopAtEntry).toBe(true);
  });

  it('stopAtEntry defaults to false', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.stopAtEntry).toBe(false);
  });

  it('includes miDebuggerPath when debuggerPath is provided', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, {
      workspaceFolder: WORKSPACE,
      debuggerPath: '/usr/bin/gdb-custom',
    });
    expect(cfg.miDebuggerPath).toBe('/usr/bin/gdb-custom');
  });

  it('does not set miDebuggerPath when debuggerPath is absent', () => {
    const cfg = buildDebugConfig(makeRC(), BINARY, { workspaceFolder: WORKSPACE });
    expect(cfg.miDebuggerPath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// launchDebugSession
// ---------------------------------------------------------------------------

describe('launchDebugSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vscode.debug.startDebugging.mockResolvedValue(true);
  });

  it('calls vscode.debug.startDebugging and returns the result', async () => {
    const result = await launchDebugSession(makeRC(), BINARY, undefined, { workspaceFolder: WORKSPACE });
    expect(vscode.debug.startDebugging).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('passes the built debug config to startDebugging', async () => {
    await launchDebugSession(makeRC({ args: ['--test'] }), BINARY, undefined, { workspaceFolder: WORKSPACE });
    const [, calledConfig] = vscode.debug.startDebugging.mock.calls[0];
    expect(calledConfig.program).toBe(BINARY);
    expect(calledConfig.args).toEqual(['--test']);
  });

  it('shows a warning when sourceScripts are present', async () => {
    await launchDebugSession(
      makeRC({ sourceScripts: ['./env.sh'] }),
      BINARY,
      undefined,
      { workspaceFolder: WORKSPACE },
    );
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Source scripts'),
    );
  });

  it('still calls startDebugging even when sourceScripts warning fires', async () => {
    await launchDebugSession(
      makeRC({ sourceScripts: ['./env.sh'] }),
      BINARY,
      undefined,
      { workspaceFolder: WORKSPACE },
    );
    expect(vscode.debug.startDebugging).toHaveBeenCalledTimes(1);
  });

  it('does not warn when sourceScripts is absent', async () => {
    await launchDebugSession(makeRC(), BINARY, undefined, { workspaceFolder: WORKSPACE });
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('does not warn when sourceScripts is an empty array', async () => {
    await launchDebugSession(
      makeRC({ sourceScripts: [] }),
      BINARY,
      undefined,
      { workspaceFolder: WORKSPACE },
    );
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });
});
