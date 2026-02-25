/**
 * BuildSystemProvider interface.
 * Each build system (CMake, Bazel, Manual) implements this interface.
 */

import type { BuildTarget, RunConfig } from '../model/config';

export interface BuildResult {
  success: boolean;
  exitCode: number;
  command: string;
}

export interface RunResult {
  command: string;
  terminalTitle: string;
}

export interface BuildSystemProvider {
  readonly name: string;

  /**
   * Discover available build targets.
   * May return cached results; call refresh() to force re-discovery.
   */
  discoverTargets(): Promise<BuildTarget[]>;

  /**
   * Resolve the absolute path to the binary produced by the given config.
   * Returns undefined if the binary cannot be resolved without building.
   */
  resolveBinaryPath(config: RunConfig): Promise<string | undefined>;

  /**
   * Build the target specified by the config.
   * @param outputChannel - channel to send build output to
   */
  buildTarget(config: RunConfig, outputChannel: OutputChannel): Promise<BuildResult>;

  /**
   * Construct the shell command to run the target.
   * Does not actually execute — caller is responsible for running in a terminal.
   */
  buildRunCommand(config: RunConfig, binaryPath: string): string;

  /**
   * Construct the shell command to run tests.
   */
  buildTestCommand(config: RunConfig): string;

  /**
   * Construct the shell command for a coverage run.
   * Returns null if this provider does not support coverage mode.
   *
   * @param binaryPath  Resolved binary path (used by CMake provider).
   * @param outputDir   Directory where the HTML report should be written.
   */
  buildCoverageCommand?(
    config: RunConfig,
    binaryPath: string,
    outputDir: string,
  ): string | null;

  /**
   * Force-refresh the discovered targets.
   */
  refresh(): Promise<void>;
}

/** Minimal output channel interface to avoid importing vscode in pure modules. */
export interface OutputChannel {
  appendLine(value: string): void;
}
