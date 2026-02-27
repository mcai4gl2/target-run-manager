import * as path from 'path';
import { parseFile } from '../../loader/parser';

const FIXTURES = path.join(__dirname, '../fixtures');

describe('parser', () => {
  describe('valid single-file YAML', () => {
    const result = parseFile(path.join(FIXTURES, 'valid-single-file/target-manager.yaml'));

    it('parses without errors', () => {
      expect(result.errors).toHaveLength(0);
      expect(result.raw).not.toBeNull();
    });

    it('reads version', () => {
      expect(result.raw?.version).toBe(1);
    });

    it('parses groups', () => {
      expect(result.raw?.groups).toHaveLength(1);
      expect(result.raw?.groups?.[0].id).toBe('grp-order-book');
      expect(result.raw?.groups?.[0].name).toBe('Order Book');
    });

    it('parses configs within group', () => {
      const configs = result.raw?.groups?.[0].configs ?? [];
      expect(configs).toHaveLength(2);
      expect(configs[0].id).toBe('cfg-ob-run-debug');
      expect(configs[0].name).toBe('Run (debug)');
      expect(configs[0].buildSystem).toBe('cmake');
      expect(configs[0].target).toBe('order_book_main');
      expect(configs[0].buildConfig).toBe('debug');
      expect(configs[0].runMode).toBe('run');
    });

    it('parses args as string array', () => {
      const config = result.raw?.groups?.[0].configs?.[0];
      expect(config?.args).toEqual(['--mode', 'sim']);
    });

    it('parses env as key-value map', () => {
      const config = result.raw?.groups?.[0].configs?.[0];
      expect(config?.env?.LOG_LEVEL).toBe('DEBUG');
      expect(config?.env?.DATA_DIR).toBe('${workspaceFolder}/data');
    });

    it('parses preBuild boolean', () => {
      const config = result.raw?.groups?.[0].configs?.[0];
      expect(config?.preBuild).toBe(true);
    });

    it('parses ungrouped configs', () => {
      expect(result.raw?.ungrouped).toHaveLength(1);
      expect(result.raw?.ungrouped?.[0].id).toBe('cfg-ungrouped-test');
    });

    it('parses settings', () => {
      expect(result.raw?.settings?.cmake?.defaultPreset).toBe('debug');
      expect(result.raw?.settings?.macros?.DATA_ROOT).toBe('${workspaceFolder}/data');
    });
  });

  describe('error handling', () => {
    it('returns error for non-existent file', () => {
      const result = parseFile('/nonexistent/path.yaml');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.raw).toBeNull();
    });

    it('returns error for malformed JSON', () => {
      const os = require('os');
      const fs = require('fs');
      const tmpFile = path.join(os.tmpdir(), 'malformed.json');
      fs.writeFileSync(tmpFile, '{ invalid json }');
      const result = parseFile(tmpFile);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.raw).toBeNull();
      fs.unlinkSync(tmpFile);
    });

    it('returns error when groups is not an array', () => {
      const os = require('os');
      const fs = require('fs');
      const tmpFile = path.join(os.tmpdir(), 'bad-groups.yaml');
      fs.writeFileSync(tmpFile, 'groups: "not an array"');
      const result = parseFile(tmpFile);
      expect(result.errors.some((e) => e.message.includes('groups'))).toBe(true);
      fs.unlinkSync(tmpFile);
    });

    it('returns error when group missing id', () => {
      const os = require('os');
      const fs = require('fs');
      const tmpFile = path.join(os.tmpdir(), 'no-id.yaml');
      fs.writeFileSync(tmpFile, 'groups:\n  - name: "No ID Group"\n    configs: []');
      const result = parseFile(tmpFile);
      expect(result.errors.some((e) => e.message.includes('"id"'))).toBe(true);
      fs.unlinkSync(tmpFile);
    });

    it('accepts empty file as valid', () => {
      const os = require('os');
      const fs = require('fs');
      const tmpFile = path.join(os.tmpdir(), 'empty.yaml');
      fs.writeFileSync(tmpFile, '');
      const result = parseFile(tmpFile);
      expect(result.errors).toHaveLength(0);
      expect(result.raw).not.toBeNull();
      fs.unlinkSync(tmpFile);
    });

    it('returns error when top-level is not an object', () => {
      const os = require('os');
      const fs = require('fs');
      const tmpFile = path.join(os.tmpdir(), 'array-root.yaml');
      fs.writeFileSync(tmpFile, '- item1\n- item2');
      const result = parseFile(tmpFile);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.raw).toBeNull();
      fs.unlinkSync(tmpFile);
    });
  });

  describe('compounds parsing', () => {
    const os = require('os');
    const fs = require('fs');

    it('parses a basic compound with order:parallel', () => {
      const tmpFile = path.join(os.tmpdir(), 'compounds-basic.yaml');
      fs.writeFileSync(tmpFile, [
        'compounds:',
        '  - id: cmp-demo',
        '    name: Demo Compound',
        '    configs:',
        '      - cfg-pub',
        '      - cfg-sub',
        '    order: parallel',
      ].join('\n'));
      const result = parseFile(tmpFile);
      fs.unlinkSync(tmpFile);
      expect(result.errors).toHaveLength(0);
      expect(result.raw?.compounds).toHaveLength(1);
      const c = result.raw!.compounds![0];
      expect(c.id).toBe('cmp-demo');
      expect(c.name).toBe('Demo Compound');
      expect(c.configs).toEqual(['cfg-pub', 'cfg-sub']);
      expect(c.order).toBe('parallel');
    });

    it('parses compound with order:sequential', () => {
      const tmpFile = path.join(os.tmpdir(), 'compounds-seq.yaml');
      fs.writeFileSync(tmpFile, [
        'compounds:',
        '  - id: cmp-seq',
        '    configs: [cfg-a, cfg-b]',
        '    order: sequential',
      ].join('\n'));
      const result = parseFile(tmpFile);
      fs.unlinkSync(tmpFile);
      expect(result.errors).toHaveLength(0);
      expect(result.raw?.compounds?.[0].order).toBe('sequential');
    });

    it('parses compound with tmux block', () => {
      const tmpFile = path.join(os.tmpdir(), 'compounds-tmux.yaml');
      fs.writeFileSync(tmpFile, [
        'compounds:',
        '  - id: cmp-tmux',
        '    name: Tmux Demo',
        '    configs: [cfg-a]',
        '    order: parallel',
        '    tmux:',
        '      sessionName: my-session',
        '      layout: tiled',
      ].join('\n'));
      const result = parseFile(tmpFile);
      fs.unlinkSync(tmpFile);
      expect(result.errors).toHaveLength(0);
      const c = result.raw!.compounds![0];
      expect(c.tmux).toEqual({ sessionName: 'my-session', layout: 'tiled' });
    });

    it('returns error when compounds is not an array', () => {
      const tmpFile = path.join(os.tmpdir(), 'compounds-bad.yaml');
      fs.writeFileSync(tmpFile, 'compounds: "not an array"');
      const result = parseFile(tmpFile);
      fs.unlinkSync(tmpFile);
      expect(result.errors.some((e) => e.message.includes('compounds'))).toBe(true);
    });

    it('returns error when compound is missing id', () => {
      const tmpFile = path.join(os.tmpdir(), 'compounds-noid.yaml');
      fs.writeFileSync(tmpFile, 'compounds:\n  - name: "No ID"');
      const result = parseFile(tmpFile);
      fs.unlinkSync(tmpFile);
      expect(result.errors.some((e) => e.message.includes('"id"'))).toBe(true);
    });
  });

  describe('JSON format', () => {
    it('parses valid JSON', () => {
      const os = require('os');
      const fs = require('fs');
      const tmpFile = path.join(os.tmpdir(), 'config.json');
      const content = {
        groups: [{
          id: 'grp-json',
          name: 'JSON Group',
          configs: [{
            id: 'cfg-json',
            name: 'JSON Config',
            buildSystem: 'cmake',
            runMode: 'run',
          }],
        }],
      };
      fs.writeFileSync(tmpFile, JSON.stringify(content));
      const result = parseFile(tmpFile);
      expect(result.errors).toHaveLength(0);
      expect(result.raw?.groups?.[0].id).toBe('grp-json');
      fs.unlinkSync(tmpFile);
    });
  });
});
