/**
 * BazelBuildProvider — implements BuildSystemProvider for Bazel projects.
 *
 * Commands generated:
 *   build   bazel [startup] build [--config=<c>] [extraBuildFlags] <label>
 *   run     <binaryPath> [args]  — or with runUnder:
 *           bazel [startup] run [--config=<c>] --run_under=<tool> <label> [-- <args>]
 *   test    bazel [startup] test [--config=<c>] [extraBuildFlags]
 *               --test_output=all [--test_filter=<f>] <label>
 */

import { spawn } from 'child_process';
import type { RunConfig, BuildTarget } from '../../model/config';
import type { BuildSystemProvider, BuildResult, OutputChannel } from '../provider';
import { discoverBazelTargets, resolveBazelBinaryPath } from './discovery';

export class BazelBuildProvider implements BuildSystemProvider {
  readonly name = 'bazel';

  private cachedTargets: BuildTarget[] | null = null;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async discoverTargets(): Promise<BuildTarget[]> {
    if (this.cachedTargets) {
      return this.cachedTargets;
    }
    this.cachedTargets = await discoverBazelTargets({
      workspaceRoot: this.workspaceRoot,
    });
    return this.cachedTargets;
  }

  async refresh(): Promise<void> {
    this.cachedTargets = null;
  }

  async resolveBinaryPath(config: RunConfig): Promise<string | undefined> {
    if (!config.target) { return undefined; }
    return resolveBazelBinaryPath(config.target, this.workspaceRoot);
  }

  async buildTarget(config: RunConfig, outputChannel: OutputChannel): Promise<BuildResult> {
    const args = buildBazelArgs('build', config);
    outputChannel.appendLine(`[Bazel] Running: bazel ${args.join(' ')}`);

    return new Promise((resolve) => {
      const proc = spawn('bazel', args, {
        cwd: this.workspaceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout?.on('data', (data: Buffer) =>
        outputChannel.appendLine(data.toString().trimEnd()),
      );
      proc.stderr?.on('data', (data: Buffer) =>
        outputChannel.appendLine(data.toString().trimEnd()),
      );

      proc.on('close', (code) => {
        const exitCode = code ?? 1;
        resolve({
          success: exitCode === 0,
          exitCode,
          command: `bazel ${args.join(' ')}`,
        });
      });

      proc.on('error', (err) => {
        outputChannel.appendLine(`[Bazel] Error: ${err.message}`);
        resolve({ success: false, exitCode: 1, command: `bazel ${args.join(' ')}` });
      });
    });
  }

  /**
   * Build the shell command to run the target.
   *
   * When `config.bazel.runUnder` is set, delegates to `bazel run --run_under=<tool>`
   * (binaryPath is ignored).  Otherwise runs the binary directly.
   */
  buildRunCommand(config: RunConfig, binaryPath: string): string {
    const parts: string[] = [];

    // Source scripts
    for (const script of config.sourceScripts ?? []) {
      parts.push(`. ${script}`);
    }

    // Env var prefix
    const envParts = Object.entries(config.env ?? {}).map(
      ([k, v]) => `${k}=${shellQuote(v)}`,
    );

    let cmd: string;
    if (config.bazel?.runUnder) {
      const args = buildBazelArgs('run', config);
      cmd = `bazel ${args.join(' ')}`;
    } else {
      cmd = [binaryPath, ...(config.args ?? []).map(shellQuote)].join(' ');
    }

    if (envParts.length > 0) {
      parts.push(`${envParts.join(' ')} ${cmd}`);
    } else {
      parts.push(cmd);
    }

    return parts.join(' && ');
  }

  buildTestCommand(config: RunConfig): string {
    const args = buildBazelArgs('test', config);
    return `bazel ${args.join(' ')}`;
  }
}

// ---------------------------------------------------------------------------
// Exported helper — also used in tests
// ---------------------------------------------------------------------------

/**
 * Build the Bazel CLI arguments for a given verb.
 *
 * Startup flags are placed before the verb per Bazel's argument order:
 *   bazel [startup-flags] <verb> [command-flags] [targets]
 *
 * The returned array omits the leading `bazel` binary name.
 */
export function buildBazelArgs(
  verb: 'build' | 'run' | 'test',
  config: RunConfig,
): string[] {
  const args: string[] = [];

  // Startup flags come first
  for (const flag of config.bazel?.startupFlags ?? []) {
    args.push(flag);
  }

  args.push(verb);

  // --config=<buildConfig>
  if (config.buildConfig) {
    args.push(`--config=${config.buildConfig}`);
  }

  // Extra build flags (e.g. --copt=-O0)
  for (const flag of config.bazel?.extraBuildFlags ?? []) {
    args.push(flag);
  }

  // run-only: --run_under=<tool>
  if (verb === 'run' && config.bazel?.runUnder) {
    args.push(`--run_under=${config.bazel.runUnder}`);
  }

  // test-only flags
  if (verb === 'test') {
    args.push('--test_output=all');
    if (config.bazel?.testFilter) {
      args.push(`--test_filter=${config.bazel.testFilter}`);
    }
  }

  // Target label
  if (config.target) {
    args.push(config.target);
  }

  // Program args for `run` mode are passed after --
  if (verb === 'run' && config.args && config.args.length > 0) {
    args.push('--');
    for (const arg of config.args) {
      args.push(arg);
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@%^,]+$/.test(s)) {
    return s;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}
