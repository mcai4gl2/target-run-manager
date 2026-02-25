/**
 * Perf command builder.
 *
 * Sub-tools:
 *   record   — perf record -g -F 99 -o <outputDir>/perf.data -- binary args
 *              post-process: perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
 *   stat     — perf stat -e cycles,instructions,cache-misses -- binary args
 *   annotate — perf record + perf annotate (requires debug symbols)
 */

import * as path from 'path';
import type { AnalyzeConfig, PerfSubTool } from '../../model/config';

export interface PerfCommand {
  command: string;
  postProcess?: string;
  outputFile?: string;
}

export function buildPerfCommand(
  analyzeConfig: AnalyzeConfig,
  binary: string,
  binaryArgs: string[],
  outputDir: string,
  flamegraphScript?: string,
): PerfCommand {
  const subTool = (analyzeConfig.subTool ?? 'record') as PerfSubTool;
  const extraArgs = analyzeConfig.toolArgs ?? [];
  const perfData = path.join(outputDir, 'perf.data');

  switch (subTool) {
    case 'record': {
      const parts = [
        'perf', 'record',
        '-g',
        '-F', '99',
        '-o', perfData,
        ...extraArgs,
        '--', binary, ...binaryArgs,
      ];
      const flamegraph = flamegraphScript ?? 'flamegraph.pl';
      const svgOut = path.join(outputDir, 'flame.svg');
      const postProcess = [
        `perf script -i ${perfData}`,
        'stackcollapse-perf.pl',
        `${flamegraph} > ${svgOut}`,
      ].join(' | ');
      return { command: parts.join(' '), postProcess, outputFile: svgOut };
    }
    case 'stat': {
      const parts = [
        'perf', 'stat',
        '-e', 'cycles,instructions,cache-misses',
        ...extraArgs,
        '--', binary, ...binaryArgs,
      ];
      return { command: parts.join(' ') };
    }
    case 'annotate': {
      // Record first, then annotate
      const recordParts = [
        'perf', 'record',
        '-g',
        '-o', perfData,
        ...extraArgs,
        '--', binary, ...binaryArgs,
      ];
      const postProcess = `perf annotate -i ${perfData}`;
      return { command: recordParts.join(' '), postProcess, outputFile: perfData };
    }
    default: {
      const parts = ['perf', subTool as string, ...extraArgs, '--', binary, ...binaryArgs];
      return { command: parts.join(' ') };
    }
  }
}
