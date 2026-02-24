/**
 * Parses a single config file (YAML or JSON) into a RawFile.
 * Uses js-yaml for YAML parsing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { RawFile, RawGroup, RawRunConfig, Settings } from '../model/config';

export interface ParseError {
  file: string;
  message: string;
}

export interface ParseResult {
  raw: RawFile | null;
  errors: ParseError[];
}

/** Parse a config file at the given path. Returns null on parse failure. */
export function parseFile(filePath: string): ParseResult {
  const errors: ParseError[] = [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    errors.push({ file: filePath, message: `Cannot read file: ${(e as Error).message}` });
    return { raw: null, errors };
  }

  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;

  if (ext === '.json') {
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      errors.push({ file: filePath, message: `JSON parse error: ${(e as Error).message}` });
      return { raw: null, errors };
    }
  } else {
    // .yaml or .yml
    try {
      parsed = yaml.load(content);
    } catch (e) {
      errors.push({ file: filePath, message: `YAML parse error: ${(e as Error).message}` });
      return { raw: null, errors };
    }
  }

  // Empty file is valid
  if (parsed === null || parsed === undefined) {
    return { raw: { _filePath: filePath }, errors };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({ file: filePath, message: 'Config file must be a YAML/JSON object at the top level' });
    return { raw: null, errors };
  }

  const raw = normalizeRawFile(parsed as Record<string, unknown>, filePath, errors);
  return { raw, errors };
}

function normalizeRawFile(
  obj: Record<string, unknown>,
  filePath: string,
  errors: ParseError[],
): RawFile {
  const raw: RawFile = { _filePath: filePath };

  if ('version' in obj && typeof obj.version === 'number') {
    raw.version = obj.version;
  }

  if ('groups' in obj) {
    if (!Array.isArray(obj.groups)) {
      errors.push({ file: filePath, message: '"groups" must be an array' });
    } else {
      raw.groups = obj.groups
        .filter((g, i) => {
          if (typeof g !== 'object' || g === null || Array.isArray(g)) {
            errors.push({ file: filePath, message: `groups[${i}] must be an object` });
            return false;
          }
          const group = g as Record<string, unknown>;
          if (typeof group.id !== 'string' || !group.id) {
            errors.push({ file: filePath, message: `groups[${i}] must have a string "id"` });
            return false;
          }
          return true;
        })
        .map((g) => normalizeRawGroup(g as Record<string, unknown>, filePath, errors));
    }
  }

  if ('ungrouped' in obj) {
    if (!Array.isArray(obj.ungrouped)) {
      errors.push({ file: filePath, message: '"ungrouped" must be an array' });
    } else {
      raw.ungrouped = obj.ungrouped
        .filter((c, i) => {
          if (typeof c !== 'object' || c === null || Array.isArray(c)) {
            errors.push({ file: filePath, message: `ungrouped[${i}] must be an object` });
            return false;
          }
          const cfg = c as Record<string, unknown>;
          if (typeof cfg.id !== 'string' || !cfg.id) {
            errors.push({ file: filePath, message: `ungrouped[${i}] must have a string "id"` });
            return false;
          }
          return true;
        })
        .map((c) => normalizeRawConfig(c as Record<string, unknown>, filePath));
    }
  }

  if ('settings' in obj && typeof obj.settings === 'object' && !Array.isArray(obj.settings)) {
    raw.settings = obj.settings as Settings;
  }

  return raw;
}

function normalizeRawGroup(
  obj: Record<string, unknown>,
  filePath: string,
  errors: ParseError[],
): RawGroup {
  const group: RawGroup = {
    id: obj.id as string,
    name: typeof obj.name === 'string' ? obj.name : (obj.id as string),
    configs: [],
  };

  if ('configs' in obj) {
    if (!Array.isArray(obj.configs)) {
      errors.push({ file: filePath, message: `Group "${group.id}": "configs" must be an array` });
    } else {
      group.configs = obj.configs
        .filter((c, i) => {
          if (typeof c !== 'object' || c === null || Array.isArray(c)) {
            errors.push({
              file: filePath,
              message: `Group "${group.id}" configs[${i}] must be an object`,
            });
            return false;
          }
          const cfg = c as Record<string, unknown>;
          if (typeof cfg.id !== 'string' || !cfg.id) {
            errors.push({
              file: filePath,
              message: `Group "${group.id}" configs[${i}] must have a string "id"`,
            });
            return false;
          }
          return true;
        })
        .map((c) => normalizeRawConfig(c as Record<string, unknown>, filePath));
    }
  }

  return group;
}

function normalizeRawConfig(obj: Record<string, unknown>, filePath: string): RawRunConfig {
  const cfg: RawRunConfig = { id: obj.id as string };

  // Copy all known fields — we do minimal normalization here;
  // full validation happens in validator.ts
  const stringFields = ['name', 'buildSystem', 'target', 'kind', 'buildConfig', 'runMode',
    'binaryOverride', 'cwd', 'terminal', 'template'] as const;
  for (const field of stringFields) {
    if (field in obj && typeof obj[field] === 'string') {
      (cfg as Record<string, unknown>)[field] = obj[field];
    }
  }

  const boolFields = ['preBuild'] as const;
  for (const field of boolFields) {
    if (field in obj && typeof obj[field] === 'boolean') {
      (cfg as Record<string, unknown>)[field] = obj[field];
    }
  }

  if ('args' in obj && Array.isArray(obj.args)) {
    cfg.args = (obj.args as unknown[]).map(String);
  }

  if ('env' in obj && typeof obj.env === 'object' && !Array.isArray(obj.env) && obj.env !== null) {
    cfg.env = Object.fromEntries(
      Object.entries(obj.env as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    );
  }

  if ('sourceScripts' in obj && Array.isArray(obj.sourceScripts)) {
    cfg.sourceScripts = (obj.sourceScripts as unknown[]).map(String);
  }

  if ('analyzeConfig' in obj && typeof obj.analyzeConfig === 'object' && obj.analyzeConfig !== null) {
    cfg.analyzeConfig = obj.analyzeConfig as RawRunConfig['analyzeConfig'];
  }

  if ('bazel' in obj && typeof obj.bazel === 'object' && obj.bazel !== null) {
    cfg.bazel = obj.bazel as RawRunConfig['bazel'];
  }

  if ('macros' in obj && typeof obj.macros === 'object' && !Array.isArray(obj.macros) && obj.macros !== null) {
    cfg.macros = Object.fromEntries(
      Object.entries(obj.macros as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    );
  }

  if ('overrides' in obj && typeof obj.overrides === 'object' && obj.overrides !== null) {
    cfg.overrides = obj.overrides as RawRunConfig['overrides'];
  }

  cfg._sourceFile = filePath;
  return cfg;
}
