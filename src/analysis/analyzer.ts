/**
 * Analysis mode dispatcher.
 *
 * Given a fully-expanded RunConfig (runMode = 'analyze'), this module:
 *   1. Resolves the binary path (analyzeConfig.binaryOverride > config.binaryOverride > build system)
 *   2. Resolves and creates the output directory
 *   3. Dispatches to the correct tool builder
 *   4. Returns the commands to run (main command + optional post-process)
 */

import type { RunConfig } from '../model/config';
import type { BuildSystemProvider } from '../build/provider';
import { resolveOutputDir, ensureOutputDir, defaultOutputDir } from './output';
import { buildValgrindCommand } from './tools/valgrind';
import { buildPerfCommand } from './tools/perf';
import { buildHeaptrackCommand } from './tools/heaptrack';
import { buildStraceCommand } from './tools/strace';
import { buildGprofCommand } from './tools/gprof';
import { buildCustomCommand } from './tools/custom';

export interface AnalysisResult {
  /** The main command to run in the terminal. */
  command: string;
  /** Optional post-process command (run after main completes). */
  postProcess?: string;
  /** The resolved output directory path. */
  outputDir: string;
  /** The primary output file to open (if openReport is true). */
  outputFile?: string;
  /** Terminal title to use. */
  terminalTitle: string;
}

export interface AnalyzerOptions {
  workspaceFolder: string;
  flamegraphScript?: string;
}

/**
 * Build the full analysis command set for a RunConfig in analyze mode.
 * The config must already have variables expanded.
 *
 * @throws Error if analyzeConfig is missing or the binary cannot be resolved.
 */
export async function buildAnalysisCommands(
  config: RunConfig,
  provider: BuildSystemProvider,
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const ac = config.analyzeConfig;
  if (!ac) {
    throw new Error(`Config "${config.name}" has runMode=analyze but no analyzeConfig`);
  }

  // 1. Resolve binary
  const binary = await resolveBinary(config, provider);
  if (!binary) {
    throw new Error(
      `Cannot resolve binary for "${config.name}". ` +
      `Set binaryOverride or build the target first.`,
    );
  }

  const binaryArgs = config.args ?? [];
  const cwd = config.cwd ?? options.workspaceFolder;

  // 2. Resolve output directory
  const rawOutputDir =
    ac.outputDir ??
    defaultOutputDir(options.workspaceFolder, config.id, ac.tool);

  const resolvedDir = resolveOutputDir(rawOutputDir, options.workspaceFolder);
  const outputDir = ensureOutputDir(resolvedDir);

  // 3. Build source-script prefix (same as normal run)
  const scriptPrefix = buildScriptPrefix(config);

  // 4. Dispatch to tool
  const { mainCmd, postProcess, outputFile } = dispatch(
    config,
    binary,
    binaryArgs,
    outputDir,
    cwd,
    options.flamegraphScript,
  );

  // Apply env vars and source scripts to the main command
  const envPrefix = buildEnvPrefix(config);
  const fullMain = [scriptPrefix, envPrefix, mainCmd].filter(Boolean).join(' && ');

  // If the config has its own postProcess override, it wins
  const finalPostProcess = ac.postProcess ?? postProcess;

  return {
    command: fullMain,
    postProcess: finalPostProcess,
    outputDir,
    outputFile,
    terminalTitle: `Analyze [${ac.tool}]: ${config.name}`,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function resolveBinary(
  config: RunConfig,
  provider: BuildSystemProvider,
): Promise<string | undefined> {
  // analyzeConfig.binaryOverride takes top priority
  if (config.analyzeConfig?.binaryOverride) {
    return config.analyzeConfig.binaryOverride;
  }
  // Then config-level binaryOverride
  if (config.binaryOverride) {
    return config.binaryOverride;
  }
  // Finally, ask the build system provider
  return provider.resolveBinaryPath(config);
}

interface DispatchResult {
  mainCmd: string;
  postProcess?: string;
  outputFile?: string;
}

function dispatch(
  config: RunConfig,
  binary: string,
  binaryArgs: string[],
  outputDir: string,
  cwd: string,
  flamegraphScript?: string,
): DispatchResult {
  const ac = config.analyzeConfig!;

  switch (ac.tool) {
    case 'valgrind': {
      const result = buildValgrindCommand(ac, binary, binaryArgs, outputDir);
      return { mainCmd: result.command, outputFile: result.outputFile };
    }
    case 'perf': {
      const result = buildPerfCommand(ac, binary, binaryArgs, outputDir, flamegraphScript);
      return { mainCmd: result.command, postProcess: result.postProcess, outputFile: result.outputFile };
    }
    case 'heaptrack': {
      const result = buildHeaptrackCommand(ac, binary, binaryArgs, outputDir);
      return { mainCmd: result.command, outputFile: result.outputFile };
    }
    case 'strace': {
      const result = buildStraceCommand('strace', ac, binary, binaryArgs, outputDir);
      return { mainCmd: result.command, outputFile: result.outputFile };
    }
    case 'ltrace': {
      const result = buildStraceCommand('ltrace', ac, binary, binaryArgs, outputDir);
      return { mainCmd: result.command, outputFile: result.outputFile };
    }
    case 'gprof': {
      const result = buildGprofCommand(ac, binary, binaryArgs, outputDir, cwd);
      return { mainCmd: result.command, postProcess: result.postProcess, outputFile: result.outputFile };
    }
    case 'custom': {
      const result = buildCustomCommand(ac, {
        binary,
        args: binaryArgs,
        env: config.env,
        outputDir,
        cwd,
      });
      return { mainCmd: result.command };
    }
    default:
      throw new Error(`Unknown analysis tool: "${(ac as { tool: string }).tool}"`);
  }
}

function buildScriptPrefix(config: RunConfig): string {
  if (!config.sourceScripts?.length) {
    return '';
  }
  return config.sourceScripts.map((s) => `. ${s}`).join(' && ');
}

function buildEnvPrefix(config: RunConfig): string {
  if (!config.env || Object.keys(config.env).length === 0) {
    return '';
  }
  return Object.entries(config.env)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(' ');
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@%^,]+$/.test(s)) {
    return s;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}
