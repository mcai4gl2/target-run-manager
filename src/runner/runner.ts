/**
 * Main runner — orchestrates: build → resolve binary → run/test/analyze in terminal.
 */

import * as vscode from 'vscode';
import type { RunConfig, CompoundConfig, WorkspaceModel } from '../model/config';
import type { BuildSystemProvider } from '../build/provider';
import { CMakeBuildProvider } from '../build/cmake/provider';
import { BazelBuildProvider } from '../build/bazel/provider';
import { ManualBuildProvider } from '../build/manual/provider';
import { expandConfig } from '../variables/expander';
import type { BuiltinContext } from '../variables/builtins';
import { buildAnalysisCommands } from '../analysis/analyzer';
import { launchDebugSession } from './launcher';
import type { DevContainerManager } from '../container/devcontainer';
import { RunHistoryManager } from './history';
import { executeCompound } from './compound';
import { defaultOutputDir } from '../analysis/output';
import { TaskRunner } from './taskRunner';
import { isTmuxAvailable, buildTmuxCommand } from './tmux';

export class Runner {
  private readonly taskRunner: TaskRunner;
  private outputChannel: vscode.OutputChannel;
  private model: WorkspaceModel | undefined;
  private workspaceRoot: string;
  private devContainer: DevContainerManager | undefined;
  readonly history: RunHistoryManager;

  constructor(
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
    devContainer?: DevContainerManager,
    history?: RunHistoryManager,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    this.taskRunner = new TaskRunner();
    this.devContainer = devContainer;
    this.history = history ?? new RunHistoryManager();
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

    // Record start time for history
    const startedAt = new Date();
    let buildStatus: 'success' | 'failed' | 'skipped' = 'skipped';

    // Build first if requested
    if (expanded.preBuild && expanded.buildSystem !== 'manual') {
      const buildResult = await provider.buildTarget(expanded, {
        appendLine: (line) => this.outputChannel.appendLine(line),
      });
      buildStatus = buildResult.success ? 'success' : 'failed';
      if (!buildResult.success) {
        this.history.add({
          configId: rawConfig.id,
          configName: rawConfig.name,
          startedAt,
          buildStatus,
        });
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
        await this.executeCoverage(expanded, provider);
        break;
      default:
        vscode.window.showWarningMessage(
          `[Target Run Manager] Run mode "${expanded.runMode}" not yet implemented`,
        );
    }

    // Record to history (terminal-based runs don't yield exit codes without a PTY)
    this.history.add({
      configId: rawConfig.id,
      configName: rawConfig.name,
      startedAt,
      buildStatus,
    });
  }

  /** Run a compound config (sequential, parallel, or tmux). */
  async runCompound(compound: CompoundConfig): Promise<void> {
    if (!this.model) {
      vscode.window.showErrorMessage('Target Run Manager: no config model loaded');
      return;
    }

    // Tmux path: parallel + tmux block present
    if (compound.tmux && compound.order === 'parallel') {
      if (isTmuxAvailable()) {
        await this.runCompoundTmux(compound);
        return;
      }
      this.outputChannel.appendLine(
        '[Target Run Manager] tmux not found — falling back to parallel VS Code terminals.',
      );
    }

    const model = this.model;
    await executeCompound(compound, async (configId) => {
      const allConfigs = [
        ...model.ungrouped,
        ...model.groups.flatMap((g) => g.configs),
      ];
      const config = allConfigs.find((c) => c.id === configId);
      if (config) {
        await this.runConfig(config);
      } else {
        this.outputChannel.appendLine(
          `[Target Run Manager] Compound: config id "${configId}" not found, skipping`,
        );
      }
    });
  }

  /** Run a parallel compound in a single tmux session with one pane per config. */
  private async runCompoundTmux(compound: CompoundConfig): Promise<void> {
    const model = this.model!;
    const allConfigs = [
      ...model.ungrouped,
      ...model.groups.flatMap((g) => g.configs),
    ];
    const commands: string[] = [];

    for (const configId of compound.configs) {
      const rawConfig = allConfigs.find((c) => c.id === configId);
      if (!rawConfig) {
        this.outputChannel.appendLine(
          `[Target Run Manager] Compound tmux: config "${configId}" not found, skipping`,
        );
        continue;
      }

      const provider = this.getProvider(rawConfig);
      const builtinContext = this.makeBuiltinContext(rawConfig);
      const { expanded } = expandConfig(rawConfig, model, builtinContext);

      // Build first if requested
      if (expanded.preBuild && expanded.buildSystem !== 'manual') {
        const result = await provider.buildTarget(expanded, {
          appendLine: (line) => this.outputChannel.appendLine(line),
        });
        if (!result.success) {
          this.outputChannel.appendLine(
            `[Target Run Manager] Build failed for "${rawConfig.name}", skipping in tmux session.`,
          );
          continue;
        }
      }

      const prepared = await this.prepareRunCommand(expanded, provider);
      if (prepared) {
        commands.push(prepared.command);
      }
    }

    if (commands.length === 0) {
      vscode.window.showWarningMessage(
        '[Target Run Manager] No commands to run in tmux session.',
      );
      return;
    }

    const opts = compound.tmux!;
    const sessionName = opts.sessionName ?? compound.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tmuxCmd = buildTmuxCommand(sessionName, commands, opts.layout ?? 'tiled');

    this.taskRunner.runInTerminal({
      command: tmuxCmd,
      title: `Tmux: ${compound.name}`,
      cwd: this.workspaceRoot,
      mode: 'dedicated',
    });
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

  private async executeCoverage(config: RunConfig, provider: BuildSystemProvider): Promise<void> {
    const binaryPath = await this.resolveBinary(config, provider);
    if (!binaryPath) { return; }

    if (!provider.buildCoverageCommand) {
      vscode.window.showWarningMessage(
        `[Target Run Manager] Coverage mode is not supported by the "${provider.name}" provider`,
      );
      return;
    }

    const outputDir = defaultOutputDir(this.workspaceRoot, config.id, 'coverage');
    const rawCommand = provider.buildCoverageCommand(config, binaryPath, outputDir);
    if (!rawCommand) {
      vscode.window.showWarningMessage(
        `[Target Run Manager] Coverage mode is not supported for "${config.name}"`,
      );
      return;
    }

    const cwd = config.cwd ?? this.workspaceRoot;
    const command = this.wrapIfContainer(
      withCaptureOutput(rawCommand, config.captureOutput),
      config,
      cwd,
    );

    this.taskRunner.runInTerminal({
      command,
      title: `Coverage: ${config.name}`,
      cwd,
      mode: config.terminal ?? 'dedicated',
    });
  }

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
    const prepared = await this.prepareRunCommand(config, provider);
    if (!prepared) { return; }
    this.taskRunner.runInTerminal({
      command: prepared.command,
      title: `Run: ${config.name}`,
      cwd: prepared.cwd,
      mode: config.terminal ?? 'dedicated',
    });
  }

  /**
   * Resolve the binary and build the shell command for a run-mode config
   * without opening a terminal. Used by executeRun and runCompoundTmux.
   */
  private async prepareRunCommand(
    config: RunConfig,
    provider: BuildSystemProvider,
  ): Promise<{ command: string; cwd: string } | undefined> {
    const binaryPath = await this.resolveBinary(config, provider);
    if (!binaryPath) { return undefined; }
    const cwd = config.cwd ?? this.workspaceRoot;
    const rawCommand = provider.buildRunCommand(config, binaryPath);
    const command = this.wrapIfContainer(
      withCaptureOutput(rawCommand, config.captureOutput),
      config,
      cwd,
    );
    return { command, cwd };
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
    const command = this.wrapIfContainer(
      withCaptureOutput(rawCommand, config.captureOutput),
      config,
      cwd,
    );
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

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Optionally wrap a shell command to capture stdout+stderr to a file via `tee`.
 * If captureFile is absent the original command is returned unchanged.
 */
export function withCaptureOutput(command: string, captureFile: string | undefined): string {
  if (!captureFile) { return command; }
  const safe = captureFile.replace(/'/g, "'\\''");
  return `( ${command} ) 2>&1 | tee '${safe}'`;
}
