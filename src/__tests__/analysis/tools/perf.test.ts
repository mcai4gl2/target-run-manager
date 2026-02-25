import { buildPerfCommand } from '../../../analysis/tools/perf';
import type { AnalyzeConfig } from '../../../model/config';

const BINARY = '/build/release/my_bench';
const BINARY_ARGS = ['--iterations', '1000'];
const OUTPUT_DIR = '/workspace/out/perf/2026-02-25';

function makeAC(overrides: Partial<AnalyzeConfig> = {}): AnalyzeConfig {
  return { tool: 'perf', ...overrides };
}

describe('perf tool builder', () => {
  describe('record (default)', () => {
    it('generates perf record command', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'record' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toMatch(/^perf record /);
    });

    it('includes -g flag', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'record' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain(' -g ');
    });

    it('includes default frequency -F 99', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'record' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain('-F 99');
    });

    it('sets output to <outputDir>/perf.data', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'record' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain(`-o ${OUTPUT_DIR}/perf.data`);
    });

    it('includes -- separator and binary args', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'record' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain(`-- ${BINARY}`);
      expect(command).toContain('--iterations 1000');
    });

    it('generates flamegraph post-process command', () => {
      const { postProcess } = buildPerfCommand(makeAC({ subTool: 'record' }), BINARY, [], OUTPUT_DIR);
      expect(postProcess).toBeDefined();
      expect(postProcess).toContain('perf script');
      expect(postProcess).toContain('stackcollapse-perf.pl');
      expect(postProcess).toContain('flamegraph.pl');
      expect(postProcess).toContain(`${OUTPUT_DIR}/flame.svg`);
    });

    it('uses custom flamegraph script when provided', () => {
      const { postProcess } = buildPerfCommand(
        makeAC({ subTool: 'record' }), BINARY, [], OUTPUT_DIR, '/usr/local/bin/flamegraph.pl',
      );
      expect(postProcess).toContain('/usr/local/bin/flamegraph.pl');
    });

    it('sets outputFile to flame.svg', () => {
      const { outputFile } = buildPerfCommand(makeAC({ subTool: 'record' }), BINARY, [], OUTPUT_DIR);
      expect(outputFile).toContain('flame.svg');
    });

    it('appends extra toolArgs', () => {
      const ac = makeAC({ subTool: 'record', toolArgs: ['-c', '1000000'] });
      const { command } = buildPerfCommand(ac, BINARY, [], OUTPUT_DIR);
      expect(command).toContain('-c 1000000');
    });
  });

  describe('stat', () => {
    it('generates perf stat command', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'stat' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toMatch(/^perf stat /);
    });

    it('includes default events', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'stat' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('cycles,instructions,cache-misses');
    });

    it('includes binary args', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'stat' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain('-- ' + BINARY);
    });

    it('has no postProcess', () => {
      const { postProcess } = buildPerfCommand(makeAC({ subTool: 'stat' }), BINARY, [], OUTPUT_DIR);
      expect(postProcess).toBeUndefined();
    });

    it('appends extra toolArgs', () => {
      const ac = makeAC({ subTool: 'stat', toolArgs: ['-r', '5'] });
      const { command } = buildPerfCommand(ac, BINARY, [], OUTPUT_DIR);
      expect(command).toContain('-r 5');
    });
  });

  describe('annotate', () => {
    it('generates perf record command for annotate', () => {
      const { command } = buildPerfCommand(makeAC({ subTool: 'annotate' }), BINARY, [], OUTPUT_DIR);
      expect(command).toMatch(/^perf record /);
    });

    it('generates perf annotate post-process', () => {
      const { postProcess } = buildPerfCommand(makeAC({ subTool: 'annotate' }), BINARY, [], OUTPUT_DIR);
      expect(postProcess).toContain('perf annotate');
    });

    it('sets outputFile to perf.data', () => {
      const { outputFile } = buildPerfCommand(makeAC({ subTool: 'annotate' }), BINARY, [], OUTPUT_DIR);
      expect(outputFile).toContain('perf.data');
    });
  });
});
