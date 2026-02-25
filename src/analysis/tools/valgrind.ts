/**
 * Valgrind command builder.
 *
 * Sub-tools and their auto-added preset args:
 *   memcheck  — --leak-check=full --show-leak-kinds=all --track-origins=yes --xml=yes --xml-file=...
 *   callgrind — --callgrind-out-file=... --collect-jumps=yes
 *   massif    — --massif-out-file=... --pages-as-heap=yes
 *   helgrind  — --history-level=full
 *   drd       — --check-stack-var=yes
 */

import * as path from 'path';
import type { AnalyzeConfig, ValgrindSubTool } from '../../model/config';

export interface ValgrindCommand {
  /** Full shell command string (not yet joined with binary). */
  command: string;
  /** Suggested output file path for the report (for openReport). */
  outputFile?: string;
}

/** Build the valgrind command prefix and args. Returns the complete command including binary+args. */
export function buildValgrindCommand(
  analyzeConfig: AnalyzeConfig,
  binary: string,
  binaryArgs: string[],
  outputDir: string,
): ValgrindCommand {
  const subTool = (analyzeConfig.subTool ?? 'memcheck') as ValgrindSubTool;
  const presetArgs = getPresetArgs(subTool, outputDir);
  const extraArgs = analyzeConfig.toolArgs ?? [];

  const parts: string[] = ['valgrind'];

  // Apply sub-tool flag (except memcheck which is the default)
  if (subTool !== 'memcheck') {
    parts.push(`--tool=${subTool}`);
  }

  parts.push(...presetArgs, ...extraArgs, '--', binary, ...binaryArgs);

  const outputFile = getOutputFile(subTool, outputDir);
  return { command: parts.join(' '), outputFile };
}

function getPresetArgs(subTool: ValgrindSubTool, outputDir: string): string[] {
  switch (subTool) {
    case 'memcheck':
      return [
        '--leak-check=full',
        '--show-leak-kinds=all',
        '--track-origins=yes',
        '--xml=yes',
        `--xml-file=${path.join(outputDir, 'valgrind-memcheck.xml')}`,
      ];
    case 'callgrind':
      return [
        `--callgrind-out-file=${path.join(outputDir, 'callgrind.out')}`,
        '--collect-jumps=yes',
      ];
    case 'massif':
      return [
        `--massif-out-file=${path.join(outputDir, 'massif.out')}`,
        '--pages-as-heap=yes',
      ];
    case 'helgrind':
      return ['--history-level=full'];
    case 'drd':
      return ['--check-stack-var=yes'];
    default:
      return [];
  }
}

function getOutputFile(subTool: ValgrindSubTool, outputDir: string): string | undefined {
  switch (subTool) {
    case 'memcheck':
      return path.join(outputDir, 'valgrind-memcheck.xml');
    case 'callgrind':
      return path.join(outputDir, 'callgrind.out');
    case 'massif':
      return path.join(outputDir, 'massif.out');
    default:
      return undefined;
  }
}
