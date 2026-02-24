/**
 * Config storage — reads and writes RunConfig/Group data to YAML files.
 * All mutating operations are read-modify-write on the source YAML file.
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

  // -------------------------------------------------------------------------
  // File resolution
  // -------------------------------------------------------------------------

  /** The primary writable config file (inside config dir, or the fallback). */
  getPrimaryFile(): string {
    const configDir = path.join(this.workspaceRoot, CONFIG_DIR);
    if (fs.existsSync(configDir)) {
      return path.join(configDir, 'configs.yaml');
    }
    return path.join(this.workspaceRoot, FALLBACK_YAML);
  }

  /** Ensure the config directory exists and return the primary file path. */
  ensureConfigDir(): string {
    const configDir = path.join(this.workspaceRoot, CONFIG_DIR);
    fs.mkdirSync(configDir, { recursive: true });
    return this.getPrimaryFile();
  }

  // -------------------------------------------------------------------------
  // Config CRUD
  // -------------------------------------------------------------------------

  /**
   * Save (create or update) a config.
   *
   * - If the config has a `_sourceFile`, it is updated in that file in-place.
   * - Otherwise it is created in `targetGroupId`'s group (or ungrouped) in the
   *   primary config file.
   *
   * @param config      The config to save (should be cleaned up — no internal fields).
   * @param targetGroupId  Group id to place a new config in (undefined → ungrouped).
   * @param model       Current workspace model (used to locate source file for updates).
   */
  saveConfig(config: RunConfig, targetGroupId: string | undefined, model: WorkspaceModel): void {
    const plain = ConfigStorage.configToPlain(config);

    // Determine the target file
    const existingConfig = this.findConfig(config.id, model);
    const targetFile = existingConfig?._sourceFile ?? this.ensureConfigDir();

    const raw = this.readRawYaml(targetFile) ?? {};

    if (targetGroupId) {
      // Save into a named group
      const groups = (raw.groups ?? []) as RawGroup[];
      let group = groups.find((g) => g.id === targetGroupId);
      if (!group) {
        // Group doesn't exist in this file yet — create it
        const modelGroup = model.groups.find((g) => g.id === targetGroupId);
        group = { id: targetGroupId, name: modelGroup?.name ?? targetGroupId, configs: [] };
        groups.push(group);
      }
      group.configs = group.configs ?? [];
      const idx = group.configs.findIndex((c) => c.id === config.id);
      if (idx >= 0) {
        group.configs[idx] = plain as RawPlainConfig;
      } else {
        group.configs.push(plain as RawPlainConfig);
      }
      raw.groups = groups;
    } else {
      // Save as ungrouped — first check if it's currently in a group
      const inGroup = this.findConfigGroup(config.id, model);
      if (inGroup) {
        // Remove from group, put in ungrouped
        this.removeConfigFromFile(config.id, targetFile, raw);
      }
      const ungrouped = (raw.ungrouped ?? []) as RawPlainConfig[];
      const idx = ungrouped.findIndex((c) => c.id === config.id);
      if (idx >= 0) {
        ungrouped[idx] = plain as RawPlainConfig;
      } else {
        ungrouped.push(plain as RawPlainConfig);
      }
      raw.ungrouped = ungrouped;
    }

    this.writeYaml(targetFile, raw);
  }

  /**
   * Delete a config from its source file.
   */
  deleteConfig(configId: string, model: WorkspaceModel): void {
    const config = this.findConfig(configId, model);
    if (!config?._sourceFile) {
      return;
    }
    const raw = this.readRawYaml(config._sourceFile);
    if (!raw) {
      return;
    }
    this.removeConfigFromFile(configId, config._sourceFile, raw);
    this.writeYaml(config._sourceFile, raw);
  }

  /**
   * Clone a config — creates a copy with a new ID in the same group/file.
   * Returns the cloned config.
   */
  cloneConfig(sourceConfig: RunConfig, model: WorkspaceModel): RunConfig {
    const newId = this.generateId(sourceConfig.id);
    const cloned: RunConfig = {
      ...sourceConfig,
      id: newId,
      name: `${sourceConfig.name} (copy)`,
      _sourceFile: undefined,
    };

    const groupId = this.findConfigGroup(sourceConfig.id, model)?.id;
    this.saveConfig(cloned, groupId, model);
    return cloned;
  }

  /**
   * Move a config from its current group to another group (or ungrouped).
   * The config is removed from its current location and inserted into the target.
   */
  moveConfigToGroup(
    configId: string,
    targetGroupId: string | undefined,
    model: WorkspaceModel,
  ): void {
    const config = this.findConfig(configId, model);
    if (!config) {
      return;
    }

    // Delete from current location
    this.deleteConfig(configId, model);

    // Re-save in target group (reload model is caller's responsibility)
    const freshConfig = { ...config, _sourceFile: undefined };
    this.saveConfig(freshConfig, targetGroupId, model);
  }

  // -------------------------------------------------------------------------
  // Group CRUD
  // -------------------------------------------------------------------------

  /**
   * Add a new empty group to the primary config file.
   */
  addGroup(id: string, name: string): void {
    const targetFile = this.ensureConfigDir();
    const raw = this.readRawYaml(targetFile) ?? {};
    const groups = (raw.groups ?? []) as RawGroup[];
    if (!groups.find((g) => g.id === id)) {
      groups.push({ id, name, configs: [] });
    }
    raw.groups = groups;
    this.writeYaml(targetFile, raw);
  }

  /**
   * Rename a group. Updates all files that contain this group id.
   */
  renameGroup(groupId: string, newName: string, model: WorkspaceModel): void {
    // Collect all source files that contain this group
    const sourceFiles = this.getGroupSourceFiles(groupId, model);
    for (const filePath of sourceFiles) {
      const raw = this.readRawYaml(filePath);
      if (!raw) {
        continue;
      }
      const groups = (raw.groups ?? []) as RawGroup[];
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        group.name = newName;
      }
      this.writeYaml(filePath, raw);
    }
  }

  /**
   * Delete a group (only if it has no configs, or force=true).
   * Removes the group entry from all files that define it.
   */
  deleteGroup(groupId: string, model: WorkspaceModel, force = false): boolean {
    const group = model.groups.find((g) => g.id === groupId);
    if (!force && group && group.configs.length > 0) {
      return false; // not empty
    }

    const sourceFiles = this.getGroupSourceFiles(groupId, model);
    for (const filePath of sourceFiles) {
      const raw = this.readRawYaml(filePath);
      if (!raw) {
        continue;
      }
      raw.groups = ((raw.groups ?? []) as RawGroup[]).filter((g) => g.id !== groupId);
      this.writeYaml(filePath, raw);
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private findConfig(configId: string, model: WorkspaceModel): RunConfig | undefined {
    const allConfigs = [
      ...model.ungrouped,
      ...model.groups.flatMap((g) => g.configs),
    ];
    return allConfigs.find((c) => c.id === configId);
  }

  private findConfigGroup(configId: string, model: WorkspaceModel): Group | undefined {
    return model.groups.find((g) => g.configs.some((c) => c.id === configId));
  }

  private getGroupSourceFiles(groupId: string, model: WorkspaceModel): string[] {
    const group = model.groups.find((g) => g.id === groupId);
    if (!group) {
      return [];
    }
    // Collect unique source files of all configs in this group
    const files = new Set<string>();
    for (const config of group.configs) {
      if (config._sourceFile) {
        files.add(config._sourceFile);
      }
    }
    // If no configs, the group may still be in the primary file
    if (files.size === 0) {
      files.add(this.getPrimaryFile());
    }
    return [...files];
  }

  /** Remove a config from groups and ungrouped within an already-loaded raw object. */
  private removeConfigFromFile(configId: string, _filePath: string, raw: Record<string, unknown>): void {
    for (const group of (raw.groups ?? []) as RawGroup[]) {
      group.configs = (group.configs ?? []).filter((c) => c.id !== configId);
    }
    if (raw.ungrouped) {
      raw.ungrouped = (raw.ungrouped as RawPlainConfig[]).filter((c) => c.id !== configId);
    }
  }

  /** Generate a new unique ID based on an existing one. */
  private generateId(baseId: string): string {
    const suffix = `-copy-${Date.now().toString(36)}`;
    return `${baseId}${suffix}`;
  }

  // -------------------------------------------------------------------------
  // YAML I/O
  // -------------------------------------------------------------------------

  readRawYaml(filePath: string): Record<string, unknown> | null {
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

  writeYaml(filePath: string, content: unknown): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const yamlStr = yaml.dump(content, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
    fs.writeFileSync(filePath, yamlStr, 'utf-8');
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  /** Convert a RunConfig to a plain object suitable for YAML serialization. */
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

// ---------------------------------------------------------------------------
// Internal raw types
// ---------------------------------------------------------------------------

interface RawGroup {
  id: string;
  name: string;
  configs?: RawPlainConfig[];
}

interface RawPlainConfig {
  id: string;
  [key: string]: unknown;
}
