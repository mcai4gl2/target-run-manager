/**
 * Merges multiple parsed RawFile objects into a single WorkspaceModel.
 *
 * Merge rules:
 * - groups: Groups with the same id are deep-merged (configs concatenated). Different ids coexist.
 * - ungrouped: All ungrouped configs concatenated.
 * - settings: Deep-merged. Deeper files (higher index in load order) take precedence.
 * - fileMacros: Each file's settings.macros stored by file path.
 */

import type { RawFile, WorkspaceModel, Group, Settings, CompoundConfig } from '../model/config';

export interface MergeWarning {
  message: string;
}

export interface MergeResult {
  model: WorkspaceModel;
  warnings: MergeWarning[];
}

export function mergeFiles(rawFiles: RawFile[]): MergeResult {
  const warnings: MergeWarning[] = [];

  const model: WorkspaceModel = {
    groups: [],
    ungrouped: [],
    compounds: [],
    settings: {},
    fileMacros: new Map(),
  };

  // Track all config ids to detect duplicates
  const seenConfigIds = new Map<string, string>(); // id -> first file
  // Track compound ids to detect duplicates
  const seenCompoundIds = new Set<string>();
  // Track group ids to merge
  const groupsById = new Map<string, Group>();
  const groupOrder: string[] = [];

  for (const raw of rawFiles) {
    // Merge version (take the first one found)
    if (raw.version !== undefined && model.version === undefined) {
      model.version = raw.version;
    }

    // Merge settings (later files take precedence)
    if (raw.settings) {
      model.settings = deepMergeSettings(model.settings, raw.settings);

      // Store file-level macros separately for macro scope resolution
      if (raw.settings.macros) {
        model.fileMacros.set(raw._filePath, { ...raw.settings.macros });
      }
    }

    // Merge groups
    for (const rawGroup of raw.groups ?? []) {
      let group = groupsById.get(rawGroup.id);
      if (!group) {
        group = { id: rawGroup.id, name: rawGroup.name, configs: [] };
        groupsById.set(rawGroup.id, group);
        groupOrder.push(rawGroup.id);
      }

      for (const rawConfig of rawGroup.configs ?? []) {
        const existing = seenConfigIds.get(rawConfig.id);
        if (existing) {
          warnings.push({
            message: `Duplicate config id "${rawConfig.id}" in ${raw._filePath} (first seen in ${existing}). First occurrence wins.`,
          });
          continue;
        }
        seenConfigIds.set(rawConfig.id, raw._filePath);
        group.configs.push({ ...rawConfig, _sourceFile: raw._filePath } as Group['configs'][0]);
      }
    }

    // Merge compounds (deduplicate by id; first occurrence wins)
    for (const rawCompound of raw.compounds ?? []) {
      if (seenCompoundIds.has(rawCompound.id)) { continue; }
      seenCompoundIds.add(rawCompound.id);
      model.compounds.push({
        id: rawCompound.id,
        name: rawCompound.name ?? rawCompound.id,
        configs: rawCompound.configs ?? [],
        order: rawCompound.order ?? 'sequential',
        _sourceFile: raw._filePath,
      } as CompoundConfig);
    }

    // Merge ungrouped
    for (const rawConfig of raw.ungrouped ?? []) {
      const existing = seenConfigIds.get(rawConfig.id);
      if (existing) {
        warnings.push({
          message: `Duplicate config id "${rawConfig.id}" in ${raw._filePath} (first seen in ${existing}). First occurrence wins.`,
        });
        continue;
      }
      seenConfigIds.set(rawConfig.id, raw._filePath);
      model.ungrouped.push({ ...rawConfig, _sourceFile: raw._filePath } as WorkspaceModel['ungrouped'][0]);
    }
  }

  // Reconstruct groups in insertion order
  model.groups = groupOrder.map((id) => groupsById.get(id)!);

  return { model, warnings };
}

/** Deep-merge settings objects. `override` takes precedence over `base`. */
export function deepMergeSettings(base: Settings, override: Settings): Settings {
  const result: Settings = { ...base };

  if (override.cmake) {
    result.cmake = { ...base.cmake, ...override.cmake };
  }

  if (override.bazel) {
    result.bazel = { ...base.bazel, ...override.bazel };
  }

  if (override.devcontainerAutoDetect !== undefined) {
    result.devcontainerAutoDetect = override.devcontainerAutoDetect;
  }

  if (override.analysis) {
    result.analysis = { ...base.analysis, ...override.analysis };
  }

  if (override.macros) {
    result.macros = { ...base.macros, ...override.macros };
  }

  return result;
}
