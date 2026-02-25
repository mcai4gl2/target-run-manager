import { buildValgrindCommand } from '../../../analysis/tools/valgrind';
import type { AnalyzeConfig } from '../../../model/config';

const BINARY = '/build/debug/my_app';
const BINARY_ARGS = ['--mode', 'sim'];
const OUTPUT_DIR = '/workspace/out/analysis/2026-02-25/cfg-test/valgrind';

function makeAC(overrides: Partial<AnalyzeConfig> = {}): AnalyzeConfig {
  return { tool: 'valgrind', ...overrides };
}

describe('valgrind tool builder', () => {
  describe('memcheck (default)', () => {
    it('includes valgrind binary', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toMatch(/^valgrind /);
    });

    it('does NOT add --tool=memcheck (memcheck is default)', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).not.toContain('--tool=memcheck');
    });

    it('adds --leak-check=full', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain('--leak-check=full');
    });

    it('adds --track-origins=yes', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain('--track-origins=yes');
    });

    it('adds --xml=yes and --xml-file pointing to outputDir', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain('--xml=yes');
      expect(command).toContain(OUTPUT_DIR);
      expect(command).toContain('valgrind-memcheck.xml');
    });

    it('includes -- separator and binary', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain(`-- ${BINARY}`);
    });

    it('includes binary args', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(command).toContain('--mode sim');
    });

    it('returns outputFile pointing to xml', () => {
      const { outputFile } = buildValgrindCommand(makeAC({ subTool: 'memcheck' }), BINARY, BINARY_ARGS, OUTPUT_DIR);
      expect(outputFile).toContain('valgrind-memcheck.xml');
    });
  });

  describe('callgrind', () => {
    it('adds --tool=callgrind', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'callgrind' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--tool=callgrind');
    });

    it('adds --callgrind-out-file pointing to outputDir', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'callgrind' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--callgrind-out-file=');
      expect(command).toContain('callgrind.out');
    });

    it('adds --collect-jumps=yes', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'callgrind' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--collect-jumps=yes');
    });

    it('returns outputFile for callgrind.out', () => {
      const { outputFile } = buildValgrindCommand(makeAC({ subTool: 'callgrind' }), BINARY, [], OUTPUT_DIR);
      expect(outputFile).toContain('callgrind.out');
    });
  });

  describe('massif', () => {
    it('adds --tool=massif and --massif-out-file', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'massif' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--tool=massif');
      expect(command).toContain('--massif-out-file=');
      expect(command).toContain('massif.out');
    });

    it('adds --pages-as-heap=yes', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'massif' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--pages-as-heap=yes');
    });
  });

  describe('helgrind', () => {
    it('adds --tool=helgrind and --history-level=full', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'helgrind' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--tool=helgrind');
      expect(command).toContain('--history-level=full');
    });

    it('returns no outputFile', () => {
      const { outputFile } = buildValgrindCommand(makeAC({ subTool: 'helgrind' }), BINARY, [], OUTPUT_DIR);
      expect(outputFile).toBeUndefined();
    });
  });

  describe('drd', () => {
    it('adds --tool=drd and --check-stack-var=yes', () => {
      const { command } = buildValgrindCommand(makeAC({ subTool: 'drd' }), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--tool=drd');
      expect(command).toContain('--check-stack-var=yes');
    });
  });

  describe('toolArgs appended after presets', () => {
    it('user toolArgs come after preset args', () => {
      const ac = makeAC({ subTool: 'memcheck', toolArgs: ['--num-callers=30', '--error-limit=no'] });
      const { command } = buildValgrindCommand(ac, BINARY, [], OUTPUT_DIR);
      // Preset args should appear first, user args after
      const presetIdx = command.indexOf('--leak-check=full');
      const userIdx = command.indexOf('--num-callers=30');
      expect(presetIdx).toBeGreaterThanOrEqual(0);
      expect(userIdx).toBeGreaterThan(presetIdx);
    });

    it('includes all user toolArgs', () => {
      const ac = makeAC({ subTool: 'callgrind', toolArgs: ['--branch-sim=yes', '--cache-sim=yes'] });
      const { command } = buildValgrindCommand(ac, BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--branch-sim=yes');
      expect(command).toContain('--cache-sim=yes');
    });
  });

  describe('defaults', () => {
    it('defaults to memcheck when subTool is not specified', () => {
      const { command } = buildValgrindCommand(makeAC(), BINARY, [], OUTPUT_DIR);
      expect(command).toContain('--leak-check=full');
    });
  });
});
