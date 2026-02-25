/**
 * Debug launcher — builds a cppdbg DebugConfiguration and calls
 * vscode.debug.startDebugging() directly, without writing to launch.json.
 */

import * as vscode from 'vscode';
import type { RunConfig } from '../model/config';

export interface LaunchOptions {
  /** Workspace folder path (used as cwd fallback). */
  workspaceFolder: string;
  /** GDB or LLDB. Defaults to 'gdb'. */
  miMode?: 'gdb' | 'lldb';
  /** Absolute path to the debugger binary (e.g. /usr/bin/gdb). */
  debuggerPath?: string;
  /** Stop at the program entry point. Defaults to false. */
  stopAtEntry?: boolean;
}

/**
 * Build an in-memory cppdbg DebugConfiguration from a RunConfig and a
 * resolved binary path.  Does NOT touch launch.json.
 */
export function buildDebugConfig(
  config: RunConfig,
  binaryPath: string,
  options: LaunchOptions,
): vscode.DebugConfiguration {
  const environment = Object.entries(config.env ?? {}).map(([name, value]) => ({ name, value }));

  const cfg: vscode.DebugConfiguration = {
    type: 'cppdbg',
    name: `Debug: ${config.name}`,
    request: 'launch',
    program: binaryPath,
    args: config.args ?? [],
    cwd: config.cwd ?? options.workspaceFolder,
    environment,
    externalConsole: false,
    MIMode: options.miMode ?? 'gdb',
    stopAtEntry: options.stopAtEntry ?? false,
    setupCommands: [
      {
        description: 'Enable pretty-printing for gdb',
        text: '-enable-pretty-printing',
        ignoreFailures: true,
      },
    ],
  };

  if (options.debuggerPath) {
    cfg['miDebuggerPath'] = options.debuggerPath;
  }

  return cfg;
}

/**
 * Launch a debug session directly using vscode.debug.startDebugging().
 * Warns if source scripts are configured (they cannot be sourced by cppdbg).
 */
export async function launchDebugSession(
  config: RunConfig,
  binaryPath: string,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  options: LaunchOptions,
): Promise<boolean> {
  if (config.sourceScripts && config.sourceScripts.length > 0) {
    vscode.window.showWarningMessage(
      '[Target Run Manager] Source scripts are not supported in debug mode and will be skipped.',
    );
  }

  const debugConfig = buildDebugConfig(config, binaryPath, options);
  return vscode.debug.startDebugging(workspaceFolder, debugConfig);
}
