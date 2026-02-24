/**
 * Main runner — orchestrates: build → resolve binary → run/test in terminal.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { RunConfig, WorkspaceModel } from '../model/config';
import type { BuildSystemProvider } from '../build/provider';
import { CMakeBuildProvider } from '../build/cmake/provider';
import { ManualBuildProvider } from '../build/manual/provider';
import { expandConfig } from '../variables/expander';
import type { BuiltinContext } from '../variables/builtins';
import { TaskRunner } from './taskRunner';

export class Runner {
  private readonly taskRunner: TaskRunner;
  private outputChannel: vscode.OutputChannel;
  private model: WorkspaceModel | undefined;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    this.taskRunner = new TaskRunner();
  }

  setModel(model: WorkspaceModel): void {
    this.model = model;
  }

  /** Run a config (build if requested, then execute). */
  async runConfig(rawConfig: RunConfig): Promise<void> {
    if (!this.model) {
      vscode.window.showErrorMessage('Target Run Manager: no config model loaded');
      return;
    }

    const provider = this.getProvider(rawConfig);
    const builtinContext = this.makeBuiltinContext(rawConfig);
    const { expanded, warnings } = expandConfig(rawConfig, this.model, builtinContext);

    for (const w of warnings) {
      this.outputChannel.appendLine(`[Warning] ${w.message}`);
    }

    // Build first if requested
    if (expanded.preBuild && expanded.buildSystem !== 'manual') {
      const buildResult = await provider.buildTarget(expanded, {
        appendLine: (line) => this.outputChannel.appendLine(line),
      });
      if (!buildResult.success) {
        vscode.window.showErrorMessage(
          `[Target Run Manager] Build failed (exit code ${buildResult.exitCode})`,
        );
        return;
      }
    }

    switch (expanded.runMode) {
      case 'run':
        await this.executeRun(expanded, provider);
        break;
      case 'test':
        await this.executeTest(expanded, provider);
        break;
      case 'coverage':
        vscode.window.showWarningMessage(
          `[Target Run Manager] Run mode "coverage" coming in a future phase`,
        );
        break;
      default:
        vscode.window.showWarningMessage(
          `[Target Run Manager] Run mode "${expanded.runMode}" not yet implemented`,
        );
    }
  }

  /** Build the target for a config without running it. */
  async buildConfig(rawConfig: RunConfig): Promise<void> {
    if (!this.model) {
      return;
    }

    const provider = this.getProvider(rawConfig);
    const builtinContext = this.makeBuiltinContext(rawConfig);
    const { expanded } = expandConfig(rawConfig, this.model, builtinContext);

    this.outputChannel.show();
    const result = await provider.buildTarget(expanded, {
      appendLine: (line) => this.outputChannel.appendLine(line),
    });

    if (result.success) {
      vscode.window.showInformationMessage(`[Target Run Manager] Build succeeded: ${rawConfig.name}`);
    } else {
      vscode.window.showErrorMessage(
        `[Target Run Manager] Build failed (exit code ${result.exitCode}): ${rawConfig.name}`,
      );
    }
  }

  private async executeRun(config: RunConfig, provider: BuildSystemProvider): Promise<void> {
    let binaryPath: string | undefined;

    if (config.binaryOverride) {
      binaryPath = config.binaryOverride;
    } else {
      binaryPath = await provider.resolveBinaryPath(config);
    }

    if (!binaryPath) {
      vscode.window.showErrorMessage(
        `[Target Run Manager] Cannot resolve binary for "${config.name}". Try building first.`,
      );
      return;
    }

    const command = provider.buildRunCommand(config, binaryPath);
    this.taskRunner.runInTerminal({
      command,
      title: `Run: ${config.name}`,
      cwd: config.cwd ?? this.workspaceRoot,
      mode: config.terminal ?? 'dedicated',
    });
  }

  private async executeTest(config: RunConfig, provider: BuildSystemProvider): Promise<void> {
    const command = provider.buildTestCommand(config);
    if (!command) {
      vscode.window.showErrorMessage(`[Target Run Manager] Cannot build test command for "${config.name}"`);
      return;
    }

    this.taskRunner.runInTerminal({
      command,
      title: `Test: ${config.name}`,
      cwd: config.cwd ?? this.workspaceRoot,
      mode: config.terminal ?? 'dedicated',
    });
  }

  private getProvider(config: RunConfig): BuildSystemProvider {
    switch (config.buildSystem) {
      case 'cmake':
        return new CMakeBuildProvider(this.workspaceRoot);
      case 'manual':
        return new ManualBuildProvider();
      default:
        // Default to manual for unknown build systems
        return new ManualBuildProvider();
    }
  }

  private makeBuiltinContext(config: RunConfig): BuiltinContext {
    return {
      workspaceFolder: this.workspaceRoot,
      buildConfig: config.buildConfig,
    };
  }

  dispose(): void {
    this.taskRunner.dispose();
  }
}
