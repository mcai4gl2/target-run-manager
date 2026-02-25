/**
 * CMake build system provider.
 * Implements BuildSystemProvider using cmake --build and ctest.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import type { RunConfig, BuildTarget } from '../../model/config';
import type { BuildSystemProvider, BuildResult, OutputChannel } from '../provider';
import { discoverCMakeTargets, resolveCMakeBinaryPath } from './discovery';

export class CMakeBuildProvider implements BuildSystemProvider {
  readonly name = 'cmake';

  private cachedTargets: BuildTarget[] | null = null;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async discoverTargets(): Promise<BuildTarget[]> {
    if (this.cachedTargets) {
      return this.cachedTargets;
    }
    return this.refresh().then(() => this.cachedTargets ?? []);
  }

  async refresh(): Promise<void> {
    // We need a build dir — without a configured preset we can't do much
    // The caller should supply the build dir via the config's buildConfig (preset name)
    this.cachedTargets = null;
  }

  async discoverTargetsForConfig(config: RunConfig): Promise<BuildTarget[]> {
    const buildDir = this.getBuildDir(config);
    this.cachedTargets = await discoverCMakeTargets({
      workspaceRoot: this.workspaceRoot,
      buildDir,
      preset: config.buildConfig,
    });
    return this.cachedTargets;
  }

  async resolveBinaryPath(config: RunConfig): Promise<string | undefined> {
    if (!config.target) {
      return undefined;
    }
    const buildDir = this.getBuildDir(config);
    return resolveCMakeBinaryPath(buildDir, config.target);
  }

  async buildTarget(config: RunConfig, outputChannel: OutputChannel): Promise<BuildResult> {
    const preset = config.buildConfig;
    let command: string;
    let args: string[];

    if (preset) {
      command = 'cmake';
      args = ['--build', '--preset', preset];
      if (config.target) {
        args.push('--target', config.target);
      }
    } else {
      command = 'cmake';
      args = ['--build', this.getBuildDir(config)];
      if (config.target) {
        args.push('--target', config.target);
      }
    }

    outputChannel.appendLine(`[CMake] Running: ${command} ${args.join(' ')}`);

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: this.workspaceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout?.on('data', (data: Buffer) => outputChannel.appendLine(data.toString().trimEnd()));
      proc.stderr?.on('data', (data: Buffer) => outputChannel.appendLine(data.toString().trimEnd()));

      proc.on('close', (code) => {
        const exitCode = code ?? 1;
        resolve({
          success: exitCode === 0,
          exitCode,
          command: `${command} ${args.join(' ')}`,
        });
      });

      proc.on('error', (err) => {
        outputChannel.appendLine(`[CMake] Error: ${err.message}`);
        resolve({ success: false, exitCode: 1, command: `${command} ${args.join(' ')}` });
      });
    });
  }

  buildRunCommand(config: RunConfig, binaryPath: string): string {
    const parts: string[] = [];

    // Source scripts
    for (const script of config.sourceScripts ?? []) {
      parts.push(`. ${script}`);
    }

    // Env vars
    const envParts = Object.entries(config.env ?? {}).map(
      ([k, v]) => `${k}=${shellQuote(v)}`,
    );

    const binaryCmd = [binaryPath, ...(config.args ?? []).map(shellQuote)].join(' ');

    if (envParts.length > 0) {
      parts.push(`${envParts.join(' ')} ${binaryCmd}`);
    } else {
      parts.push(binaryCmd);
    }

    return parts.join(' && ');
  }

  buildTestCommand(config: RunConfig): string {
    const buildDir = this.getBuildDir(config);
    const parts = ['ctest', '--output-on-failure'];

    if (config.target) {
      parts.push('-R', `^${config.target}$`);
    }

    return `ctest --test-dir ${shellQuote(buildDir)} ${parts.slice(1).join(' ')}`;
  }

  /**
   * Coverage run: execute the binary (which must have been compiled with
   * coverage instrumentation), then generate an HTML report via gcovr.
   *
   * Assumes gcovr is available on PATH.  The report is written to
   * `<outputDir>/coverage.html`.
   */
  buildCoverageCommand(
    config: RunConfig,
    binaryPath: string,
    outputDir: string,
  ): string {
    const binaryCmd = [binaryPath, ...(config.args ?? []).map(shellQuote)].join(' ');
    const gcovrCmd = [
      'gcovr',
      '--html-details',
      shellQuote(`${outputDir}/coverage.html`),
      '-r',
      shellQuote(this.workspaceRoot),
    ].join(' ');
    return `${binaryCmd} && ${gcovrCmd}`;
  }

  private getBuildDir(config: RunConfig): string {
    if (config.buildConfig) {
      return path.join(this.workspaceRoot, 'build', config.buildConfig);
    }
    return path.join(this.workspaceRoot, 'build');
  }
}

function shellQuote(s: string): string {
  // Simple shell quoting — wrap in single quotes, escape single quotes inside
  if (/^[a-zA-Z0-9._\-/=:@%^,]+$/.test(s)) {
    return s;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}
