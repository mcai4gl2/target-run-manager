import { buildGprofCommand } from '../../../analysis/tools/gprof';
import type { AnalyzeConfig } from '../../../model/config';

const BINARY = '/build/debug/my_app';
const BINARY_ARGS = ['--mode', 'sim'];
const OUTPUT_DIR = '/workspace/out/gprof/2026-02-25';
const CWD = '/workspace';

function makeAC(overrides: Partial<AnalyzeConfig> = {}): AnalyzeConfig {
  return { tool: 'gprof', ...overrides };
}

describe('gprof tool builder', () => {
  it('runs the binary directly (produces gmon.out)', () => {
    const { command } = buildGprofCommand(makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR, CWD);
    expect(command).toContain(BINARY);
    expect(command).toContain('--mode sim');
  });

  it('does NOT prefix with gprof (binary runs first)', () => {
    const { command } = buildGprofCommand(makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR, CWD);
    // The main command should just be the binary, not "gprof <binary>"
    expect(command).not.toMatch(/^gprof /);
  });

  it('generates post-process with gprof <binary> gmon.out > report', () => {
    const { postProcess } = buildGprofCommand(makeAC(), BINARY, [], OUTPUT_DIR, CWD);
    expect(postProcess).toContain('gprof');
    expect(postProcess).toContain(BINARY);
    expect(postProcess).toContain('gmon.out');
    expect(postProcess).toContain('>');
  });

  it('post-process output goes to gprof-report.txt in outputDir', () => {
    const { postProcess, outputFile } = buildGprofCommand(makeAC(), BINARY, [], OUTPUT_DIR, CWD);
    expect(postProcess).toContain(`${OUTPUT_DIR}/gprof-report.txt`);
    expect(outputFile).toBe(`${OUTPUT_DIR}/gprof-report.txt`);
  });

  it('gmon.out path is in cwd', () => {
    const { postProcess } = buildGprofCommand(makeAC(), BINARY, [], OUTPUT_DIR, CWD);
    expect(postProcess).toContain(`${CWD}/gmon.out`);
  });

  it('appends extra toolArgs to the binary command', () => {
    const ac = makeAC({ toolArgs: ['--extra-flag'] });
    const { command } = buildGprofCommand(ac, BINARY, BINARY_ARGS, OUTPUT_DIR, CWD);
    expect(command).toContain('--extra-flag');
  });
});
