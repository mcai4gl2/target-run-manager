/**
 * Main runner — orchestrates: build → resolve binary → run/test/analyze in terminal.
 */

import * as vscode from 'vscode';
import type { RunConfig, WorkspaceModel } from '../model/config';
import type { BuildSystemProvider } from '../build/provider';
import { CMakeBuildProvider } from '../build/cmake/provider';
import { BazelBuildProvider } from '../build/bazel/provider';
import { ManualBuildProvider } from '../build/manual/provider';
import { expandConfig } from '../variables/expander';
import type { BuiltinContext } from '../variables/builtins';
import { buildAnalysisCommands } from '../analysis/analyzer';
import { launchDebugSession } from './launcher';
import type { DevContainerManager } from '../container/devcontainer';
import { TaskRunner } from './taskRunner';

export class Runner {
  private readonly taskRunner: TaskRunner;
  private outputChannel: vscode.OutputChannel;
  private model: WorkspaceModel | undefined;
  private workspaceRoot: string;
  private devContainer: DevContainerManager | undefined;

  constructor(
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
    devContainer?: DevContainerManager,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    this.taskRunner = new TaskRunner();
    this.devContainer = devContainer;
  }

  setModel(model: WorkspaceModel): void {
    this.model = model;
  }

  /** Run a config (build if requested, then execute in appropriate mode). */
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
      case 'debug':
        await this.executeDebug(expanded, provider);
        break;
      case 'test':
        await this.executeTest(expanded, provider);
        break;
      case 'analyze':
        await this.executeAnalyze(expanded, provider);
        break;
      case 'coverage':
        vscode.window.showWarningMessage(
          '[Target Run Manager] Run mode "coverage" coming in a future phase',
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

  // ---- Private execute methods ----

  private async executeDebug(config: RunConfig, provider: BuildSystemProvider): Promise<void> {
    const binaryPath = await this.resolveBinary(config, provider);
    if (!binaryPath) { return; }

    if (config.devcontainer && this.devContainer?.isActive) {
      vscode.window.showWarningMessage(
        '[Target Run Manager] Debug mode inside a DevContainer requires gdbserver setup. ' +
        'Use run mode instead, or configure gdbserver manually.',
      );
      return;
    }

    const debuggerSettings = this.model?.settings.debugger;
    const folders = vscode.workspace.workspaceFolders;
    const folder = folders && folders.length > 0 ? folders[0] : undefined;

    const success = await launchDebugSession(config, binaryPath, folder, {
      workspaceFolder: this.workspaceRoot,
      miMode: debuggerSettings?.miMode ?? 'gdb',
      debuggerPath: debuggerSettings?.debuggerPath,
      stopAtEntry: debuggerSettings?.stopAtEntry,
    });

    if (!success) {
      vscode.window.showErrorMessage(
        `[Target Run Manager] Failed to start debug session for "${config.name}"`,
      );
    }
  }

  private async executeRun(config: RunConfig, provider: BuildSystemProvider): Promise<void> {
    const binaryPath = await this.resolveBinary(config, provider);
    if (!binaryPath) { return; }

    const cwd = config.cwd ?? this.workspaceRoot;
    const rawCommand = provider.buildRunCommand(config, binaryPath);
    const command = this.wrapIfContainer(rawCommand, config, cwd);
    this.taskRunner.runInTerminal({
      command,
      title: `Run: ${config.name}`,
      cwd,
      mode: config.terminal ?? 'dedicated',
    });
  }

  private async executeTest(config: RunConfig, provider: BuildSystemProvider): Promise<void> {
    const rawCommand = provider.buildTestCommand(config);
    if (!rawCommand) {
      vscode.window.showErrorMessage(
        `[Target Run Manager] Cannot build test command for "${config.name}"`,
      );
      return;
    }

    const cwd = config.cwd ?? this.workspaceRoot;
    const command = this.wrapIfContainer(rawCommand, config, cwd);
    this.taskRunner.runInTerminal({
      command,
      title: `Test: ${config.name}`,
      cwd,
      mode: config.terminal ?? 'dedicated',
    });
  }

  private async executeAnalyze(config: RunConfig, provider: BuildSystemProvider): Promise<void> {
    let result;
    try {
      result = await buildAnalysisCommands(config, provider, {
        workspaceFolder: this.workspaceRoot,
        flamegraphScript: this.model?.settings.analysis?.flamegraphScript,
      });
    } catch (e) {
      vscode.window.showErrorMessage(
        `[Target Run Manager] Analysis setup failed: ${(e as Error).message}`,
      );
      return;
    }

    this.outputChannel.appendLine(
      `[Target Run Manager] Analysis output dir: ${result.outputDir}`,
    );

    // Run main analysis command (wrap for DevContainer if needed)
    const cwd = config.cwd ?? this.workspaceRoot;
    const mainCommand = this.wrapIfContainer(result.command, config, cwd);
    this.taskRunner.runInTerminal({
      command: mainCommand,
      title: result.terminalTitle,
      cwd,
      mode: config.terminal ?? 'dedicated',
    });

    // Run post-process in a second terminal if present
    if (result.postProcess) {
      // Small delay so the user sees the two terminals as distinct steps
      setTimeout(() => {
        this.taskRunner.runInTerminal({
          command: result.postProcess!,
          title: `Post-process: ${config.name}`,
          cwd: result.outputDir,
          mode: 'dedicated',
        });
      }, 500);
    }
  }

  // ---- Helpers ----

  private async resolveBinary(
    config: RunConfig,
    provider: BuildSystemProvider,
  ): Promise<string | undefined> {
    if (config.binaryOverride) {
      return config.binaryOverride;
    }
    const resolved = await provider.resolveBinaryPath(config);
    if (!resolved) {
      vscode.window.showErrorMessage(
        `[Target Run Manager] Cannot resolve binary for "${config.name}". Try building first.`,
      );
      return undefined;
    }
    return resolved;
  }

  /**
   * Wrap a command for DevContainer execution if:
   *  - the config has devcontainer: true, OR
   *  - devcontainerAutoDetect is enabled globally and the manager reports isActive.
   */
  private wrapIfContainer(command: string, config: RunConfig, cwd: string): string {
    if (!this.devContainer) { return command; }
    const forceOn = config.devcontainer === true;
    const forceOff = config.devcontainer === false;
    if (forceOff) { return command; }
    if ((forceOn || this.model?.settings.devcontainerAutoDetect) && this.devContainer.isActive) {
      return this.devContainer.wrapCommand(command, cwd);
    }
    return command;
  }

  private getProvider(config: RunConfig): BuildSystemProvider {
    switch (config.buildSystem) {
      case 'cmake':
        return new CMakeBuildProvider(this.workspaceRoot);
      case 'bazel':
        return new BazelBuildProvider(this.workspaceRoot);
      case 'manual':
        return new ManualBuildProvider();
      default:
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
