/**
 * Config storage — writes RunConfig and Group data back to YAML files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { RunConfig, Group, WorkspaceModel } from './config';
import { CONFIG_DIR, FALLBACK_YAML } from '../loader/discovery';

export class ConfigStorage {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /** Determine the primary config file to write to. */
  private getPrimaryFile(): string {
    const configDir = path.join(this.workspaceRoot, CONFIG_DIR);
    if (fs.existsSync(configDir)) {
      return path.join(configDir, 'configs.yaml');
    }
    return path.join(this.workspaceRoot, FALLBACK_YAML);
  }

  /** Ensure the config directory exists. */
  ensureConfigDir(): void {
    const configDir = path.join(this.workspaceRoot, CONFIG_DIR);
    fs.mkdirSync(configDir, { recursive: true });
  }

  /**
   * Write a single group (with its configs) to a YAML file.
   * If the file already exists, merges the group into the existing content.
   */
  writeGroup(group: Group, filePath?: string): void {
    const target = filePath ?? this.getPrimaryFile();
    const existing = this.readRawYaml(target);

    const existingGroups: Group[] = (existing?.groups ?? []) as Group[];
    const idx = existingGroups.findIndex((g) => g.id === group.id);

    if (idx >= 0) {
      existingGroups[idx] = group;
    } else {
      existingGroups.push(group);
    }

    const content = { ...existing, groups: existingGroups };
    this.writeYaml(target, content);
  }

  /**
   * Delete a config from all files in the workspace model.
   */
  deleteConfig(configId: string, model: WorkspaceModel): void {
    // Find which file owns this config
    const allConfigs = [
      ...model.ungrouped,
      ...model.groups.flatMap((g) => g.configs),
    ];
    const config = allConfigs.find((c) => c.id === configId);
    if (!config?._sourceFile) {
      return;
    }

    const raw = this.readRawYaml(config._sourceFile);
    if (!raw) {
      return;
    }

    // Remove from groups
    for (const group of (raw.groups ?? []) as RawGroup[]) {
      group.configs = (group.configs ?? []).filter((c: { id: string }) => c.id !== configId);
    }

    // Remove from ungrouped
    if (raw.ungrouped) {
      raw.ungrouped = (raw.ungrouped as Array<{ id: string }>).filter((c) => c.id !== configId);
    }

    this.writeYaml(config._sourceFile, raw);
  }

  private readRawYaml(filePath: string): Record<string, unknown> | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore parse errors
    }
    return {};
  }

  private writeYaml(filePath: string, content: unknown): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const yamlStr = yaml.dump(content, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
    fs.writeFileSync(filePath, yamlStr, 'utf-8');
  }

  /**
   * Serialize a RunConfig as a plain object suitable for YAML dump.
   */
  static configToPlain(config: RunConfig): Record<string, unknown> {
    const plain: Record<string, unknown> = {
      id: config.id,
      name: config.name,
      buildSystem: config.buildSystem,
      runMode: config.runMode,
    };

    if (config.target) { plain.target = config.target; }
    if (config.kind) { plain.kind = config.kind; }
    if (config.buildConfig) { plain.buildConfig = config.buildConfig; }
    if (config.binaryOverride) { plain.binaryOverride = config.binaryOverride; }
    if (config.args?.length) { plain.args = config.args; }
    if (config.env && Object.keys(config.env).length) { plain.env = config.env; }
    if (config.cwd) { plain.cwd = config.cwd; }
    if (config.sourceScripts?.length) { plain.sourceScripts = config.sourceScripts; }
    if (config.preBuild !== undefined) { plain.preBuild = config.preBuild; }
    if (config.terminal) { plain.terminal = config.terminal; }
    if (config.analyzeConfig) { plain.analyzeConfig = config.analyzeConfig; }
    if (config.bazel) { plain.bazel = config.bazel; }
    if (config.macros && Object.keys(config.macros).length) { plain.macros = config.macros; }

    return plain;
  }
}

interface RawGroup {
  id: string;
  name: string;
  configs?: Array<{ id: string }>;
}
