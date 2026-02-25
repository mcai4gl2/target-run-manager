import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveOutputDir, ensureOutputDir, defaultOutputDir } from '../../analysis/output';

describe('output', () => {
  describe('resolveOutputDir', () => {
    it('expands ${date} to YYYY-MM-DD', () => {
      const result = resolveOutputDir('/out/${date}', '/workspace');
      expect(result).toMatch(/^\/out\/\d{4}-\d{2}-\d{2}$/);
    });

    it('expands ${datetime} to YYYY-MM-DDTHH:MM:SS', () => {
      const result = resolveOutputDir('/out/${datetime}', '/workspace');
      expect(result).toMatch(/^\/out\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it('expands ${workspaceFolder}', () => {
      const result = resolveOutputDir('${workspaceFolder}/out', '/my/workspace');
      expect(result).toBe('/my/workspace/out');
    });

    it('expands multiple placeholders in one path', () => {
      const result = resolveOutputDir('${workspaceFolder}/out/${date}', '/workspace');
      expect(result).toMatch(/^\/workspace\/out\/\d{4}-\d{2}-\d{2}$/);
    });

    it('leaves unknown placeholders unchanged', () => {
      const result = resolveOutputDir('/out/${unknown}', '/workspace');
      expect(result).toBe('/out/${unknown}');
    });

    it('returns path unchanged when no placeholders', () => {
      expect(resolveOutputDir('/abs/path/to/out', '/workspace')).toBe('/abs/path/to/out');
    });
  });

  describe('ensureOutputDir', () => {
    it('creates directory if it does not exist', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trm-output-'));
      const newDir = path.join(tmp, 'a', 'b', 'c');
      const result = ensureOutputDir(newDir);
      expect(fs.existsSync(result)).toBe(true);
      fs.rmSync(tmp, { recursive: true });
    });

    it('returns the resolved absolute path', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trm-output-'));
      const result = ensureOutputDir(tmp);
      expect(path.isAbsolute(result)).toBe(true);
      fs.rmdirSync(tmp);
    });

    it('does not throw if directory already exists', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trm-output-'));
      expect(() => ensureOutputDir(tmp)).not.toThrow();
      fs.rmdirSync(tmp);
    });
  });

  describe('defaultOutputDir', () => {
    it('returns path under workspaceFolder/out/analysis', () => {
      const result = defaultOutputDir('/workspace', 'cfg-test', 'valgrind');
      expect(result).toContain('/workspace/out/analysis/');
    });

    it('includes today\'s date', () => {
      const result = defaultOutputDir('/workspace', 'cfg-test', 'valgrind');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('includes configId and tool', () => {
      const result = defaultOutputDir('/workspace', 'cfg-my-app', 'perf');
      expect(result).toContain('cfg-my-app');
      expect(result).toContain('perf');
    });
  });
});
