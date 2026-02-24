import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { discoverConfigFiles, getConfigDir, getFallbackFile } from '../../loader/discovery';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trm-discovery-'));
}

describe('discovery', () => {
  describe('discoverConfigFiles', () => {
    it('returns empty array when no config exists', () => {
      const tmpDir = makeTmpDir();
      expect(discoverConfigFiles(tmpDir)).toEqual([]);
      fs.rmdirSync(tmpDir);
    });

    it('discovers single fallback YAML file', () => {
      const tmpDir = makeTmpDir();
      const vscodeDir = path.join(tmpDir, '.vscode');
      fs.mkdirSync(vscodeDir);
      const fallback = path.join(vscodeDir, 'target-manager.yaml');
      fs.writeFileSync(fallback, 'version: 1\n');
      const result = discoverConfigFiles(tmpDir);
      expect(result).toEqual([fallback]);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('prefers config directory over fallback file', () => {
      const tmpDir = makeTmpDir();
      const vscodeDir = path.join(tmpDir, '.vscode');
      fs.mkdirSync(vscodeDir);
      // Create fallback
      fs.writeFileSync(path.join(vscodeDir, 'target-manager.yaml'), '');
      // Create config dir
      const configDir = path.join(vscodeDir, 'target-manager');
      fs.mkdirSync(configDir);
      const configFile = path.join(configDir, 'configs.yaml');
      fs.writeFileSync(configFile, '');
      const result = discoverConfigFiles(tmpDir);
      expect(result).toEqual([configFile]);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('discovers files alphabetically within dir', () => {
      const tmpDir = makeTmpDir();
      const configDir = path.join(tmpDir, '.vscode', 'target-manager');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'z-last.yaml'), '');
      fs.writeFileSync(path.join(configDir, 'a-first.yaml'), '');
      fs.writeFileSync(path.join(configDir, 'm-middle.yaml'), '');
      const result = discoverConfigFiles(tmpDir);
      const names = result.map((f) => path.basename(f));
      expect(names).toEqual(['a-first.yaml', 'm-middle.yaml', 'z-last.yaml']);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('discovers files recursively in subdirectories (depth-first)', () => {
      const tmpDir = makeTmpDir();
      const configDir = path.join(tmpDir, '.vscode', 'target-manager');
      const subDir = path.join(configDir, 'analysis');
      fs.mkdirSync(subDir, { recursive: true });
      const rootFile = path.join(configDir, 'root.yaml');
      const subFile = path.join(subDir, 'sub.yaml');
      fs.writeFileSync(rootFile, '');
      fs.writeFileSync(subFile, '');
      const result = discoverConfigFiles(tmpDir);
      // Root files come before subdir files
      expect(result.indexOf(rootFile)).toBeLessThan(result.indexOf(subFile));
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('ignores non-yaml/json files', () => {
      const tmpDir = makeTmpDir();
      const configDir = path.join(tmpDir, '.vscode', 'target-manager');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'config.yaml'), '');
      fs.writeFileSync(path.join(configDir, 'README.md'), '');
      fs.writeFileSync(path.join(configDir, 'script.sh'), '');
      const result = discoverConfigFiles(tmpDir);
      expect(result).toHaveLength(1);
      expect(path.basename(result[0])).toBe('config.yaml');
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('ignores hidden files and directories', () => {
      const tmpDir = makeTmpDir();
      const configDir = path.join(tmpDir, '.vscode', 'target-manager');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'visible.yaml'), '');
      fs.writeFileSync(path.join(configDir, '.hidden.yaml'), '');
      const result = discoverConfigFiles(tmpDir);
      expect(result.every((f) => !path.basename(f).startsWith('.'))).toBe(true);
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('getConfigDir', () => {
    it('returns config dir path when it exists', () => {
      const tmpDir = makeTmpDir();
      const configDir = path.join(tmpDir, '.vscode', 'target-manager');
      fs.mkdirSync(configDir, { recursive: true });
      expect(getConfigDir(tmpDir)).toBe(configDir);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('returns undefined when config dir does not exist', () => {
      const tmpDir = makeTmpDir();
      expect(getConfigDir(tmpDir)).toBeUndefined();
      fs.rmdirSync(tmpDir);
    });
  });

  describe('getFallbackFile', () => {
    it('returns fallback yaml path when it exists', () => {
      const tmpDir = makeTmpDir();
      const vscodeDir = path.join(tmpDir, '.vscode');
      fs.mkdirSync(vscodeDir);
      const fallback = path.join(vscodeDir, 'target-manager.yaml');
      fs.writeFileSync(fallback, '');
      expect(getFallbackFile(tmpDir)).toBe(fallback);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('returns undefined when no fallback file exists', () => {
      const tmpDir = makeTmpDir();
      expect(getFallbackFile(tmpDir)).toBeUndefined();
      fs.rmdirSync(tmpDir);
    });
  });
});
