import * as path from 'path';
import { parseFile } from '../../loader/parser';
import { mergeFiles, deepMergeSettings } from '../../loader/merger';
import type { RawFile, Settings } from '../../model/config';

const FIXTURES = path.join(__dirname, '../fixtures');

describe('merger', () => {
  describe('multi-file merge', () => {
    const files = [
      path.join(FIXTURES, 'multi-file-merge/settings.yaml'),
      path.join(FIXTURES, 'multi-file-merge/order-book.yaml'),
      path.join(FIXTURES, 'multi-file-merge/analysis/order-book.yaml'),
    ];

    const rawFiles = files.map((f) => parseFile(f).raw!).filter(Boolean);

    it('loads all three files', () => {
      expect(rawFiles).toHaveLength(3);
    });

    it('merges group with same id from two files', () => {
      const { model } = mergeFiles(rawFiles);
      const orderBook = model.groups.find((g) => g.id === 'grp-order-book');
      expect(orderBook).toBeDefined();
      // order-book.yaml has 1 config, analysis/order-book.yaml has 1 config
      expect(orderBook?.configs).toHaveLength(2);
    });

    it('includes both run and analyze configs under same group', () => {
      const { model } = mergeFiles(rawFiles);
      const orderBook = model.groups.find((g) => g.id === 'grp-order-book');
      const ids = orderBook?.configs.map((c) => c.id);
      expect(ids).toContain('cfg-ob-run-debug');
      expect(ids).toContain('cfg-ob-valgrind');
    });

    it('merges settings from multiple files (later overrides earlier)', () => {
      const { model } = mergeFiles(rawFiles);
      // Settings from order-book.yaml override settings.yaml for DATA_ROOT
      expect(model.settings.macros?.DATA_ROOT).toBe('${workspaceFolder}/data/order-book');
      // SERVER_PORT from settings.yaml is preserved
      expect(model.settings.macros?.SERVER_PORT).toBe('8080');
    });

    it('stores file-level macros separately', () => {
      const { model } = mergeFiles(rawFiles);
      const orderBookFile = files[1];
      const fileMacros = model.fileMacros.get(orderBookFile);
      expect(fileMacros?.DATA_ROOT).toBe('${workspaceFolder}/data/order-book');
    });

    it('produces no warnings for valid multi-file merge', () => {
      const { warnings } = mergeFiles(rawFiles);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('duplicate config id detection', () => {
    const files = [
      path.join(FIXTURES, 'invalid-duplicate-ids/a.yaml'),
      path.join(FIXTURES, 'invalid-duplicate-ids/b.yaml'),
    ];
    const rawFiles = files.map((f) => parseFile(f).raw!).filter(Boolean);

    it('warns about duplicate config id', () => {
      const { warnings } = mergeFiles(rawFiles);
      expect(warnings.some((w) => w.message.includes('cfg-duplicate'))).toBe(true);
    });

    it('first occurrence wins', () => {
      const { model } = mergeFiles(rawFiles);
      const allConfigs = model.groups.flatMap((g) => g.configs);
      const dupes = allConfigs.filter((c) => c.id === 'cfg-duplicate');
      expect(dupes).toHaveLength(1);
      expect(dupes[0].name).toBe('Config in A');
    });
  });

  describe('ungrouped merge', () => {
    it('concatenates ungrouped configs from multiple files', () => {
      const raw1: RawFile = {
        _filePath: '/a.yaml',
        ungrouped: [{ id: 'u1', name: 'U1', buildSystem: 'cmake', runMode: 'run' }],
      };
      const raw2: RawFile = {
        _filePath: '/b.yaml',
        ungrouped: [{ id: 'u2', name: 'U2', buildSystem: 'cmake', runMode: 'run' }],
      };
      const { model } = mergeFiles([raw1, raw2]);
      expect(model.ungrouped.map((c) => c.id)).toEqual(['u1', 'u2']);
    });
  });

  describe('groups with different ids coexist', () => {
    it('keeps separate groups', () => {
      const raw1: RawFile = {
        _filePath: '/a.yaml',
        groups: [{ id: 'grp-a', name: 'Group A', configs: [{ id: 'cfg-a', name: 'A', buildSystem: 'cmake', runMode: 'run' }] }],
      };
      const raw2: RawFile = {
        _filePath: '/b.yaml',
        groups: [{ id: 'grp-b', name: 'Group B', configs: [{ id: 'cfg-b', name: 'B', buildSystem: 'cmake', runMode: 'run' }] }],
      };
      const { model } = mergeFiles([raw1, raw2]);
      expect(model.groups).toHaveLength(2);
      expect(model.groups.map((g) => g.id)).toEqual(['grp-a', 'grp-b']);
    });
  });

  describe('deepMergeSettings', () => {
    it('merges cmake settings', () => {
      const base: Settings = { cmake: { defaultPreset: 'debug' } };
      const override: Settings = { cmake: { autoRefreshOnChange: true } };
      const result = deepMergeSettings(base, override);
      expect(result.cmake?.defaultPreset).toBe('debug');
      expect(result.cmake?.autoRefreshOnChange).toBe(true);
    });

    it('override takes precedence', () => {
      const base: Settings = { cmake: { defaultPreset: 'debug' } };
      const override: Settings = { cmake: { defaultPreset: 'release' } };
      const result = deepMergeSettings(base, override);
      expect(result.cmake?.defaultPreset).toBe('release');
    });

    it('merges macros additively with override taking precedence', () => {
      const base: Settings = { macros: { A: 'from-base', B: 'from-base' } };
      const override: Settings = { macros: { A: 'from-override', C: 'new' } };
      const result = deepMergeSettings(base, override);
      expect(result.macros?.A).toBe('from-override');
      expect(result.macros?.B).toBe('from-base');
      expect(result.macros?.C).toBe('new');
    });

    it('empty merge is safe', () => {
      const result = deepMergeSettings({}, {});
      expect(result).toEqual({});
    });
  });
});
