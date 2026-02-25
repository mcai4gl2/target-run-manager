/**
 * gprof command builder.
 *
 * gprof requires the binary to be compiled with -pg.
 * Running the binary produces gmon.out; then gprof <binary> gmon.out > report.txt
 *
 * We generate:
 *   1. Run binary (produces gmon.out in cwd)
 *   2. Post-process: gprof <binary> gmon.out > <outputDir>/gprof-report.txt
 */

import * as path from 'path';
import type { AnalyzeConfig } from '../../model/config';

export interface GprofCommand {
  command: string;
  postProcess: string;
  outputFile: string;
}

export function buildGprofCommand(
  analyzeConfig: AnalyzeConfig,
  binary: string,
  binaryArgs: string[],
  outputDir: string,
  cwd: string,
): GprofCommand {
  const extraArgs = analyzeConfig.toolArgs ?? [];
  const reportFile = path.join(outputDir, 'gprof-report.txt');
  const gmonOut = path.join(cwd, 'gmon.out');

  // Run the binary normally — it writes gmon.out
  const command = [binary, ...extraArgs, ...binaryArgs].join(' ');
  // Post-process: generate human-readable report
  const postProcess = `gprof ${binary} ${gmonOut} > ${reportFile}`;

  return { command, postProcess, outputFile: reportFile };
}
