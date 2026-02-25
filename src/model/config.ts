/**
 * Core data model for Target Run Manager.
 * These types represent the in-memory structure after loading and merging all config files.
 */

export type BuildSystem = 'cmake' | 'bazel' | 'manual';
export type RunMode = 'run' | 'debug' | 'test' | 'analyze' | 'coverage';
export type TargetKind = 'executable' | 'test' | 'benchmark';
export type TerminalMode = 'dedicated' | 'shared' | 'reuse';

export type AnalysisTool =
  | 'valgrind'
  | 'perf'
  | 'gprof'
  | 'heaptrack'
  | 'strace'
  | 'ltrace'
  | 'custom';

export type ValgrindSubTool = 'memcheck' | 'callgrind' | 'massif' | 'helgrind' | 'drd';
export type PerfSubTool = 'record' | 'stat' | 'annotate';

export interface AnalyzeConfig {
  tool: AnalysisTool;
  subTool?: string;
  toolArgs?: string[];
  outputDir?: string;
  binaryOverride?: string;
  postProcess?: string;
  openReport?: boolean;
  customCommand?: string;
}

export interface BazelConfig {
  testFilter?: string;
  startupFlags?: string[];
  extraBuildFlags?: string[];
  runUnder?: string;
}

/** A single run/debug/test/analyze configuration for a target. */
export interface RunConfig {
  id: string;
  name: string;
  buildSystem: BuildSystem;
  target?: string;
  kind?: TargetKind;
  buildConfig?: string;
  runMode: RunMode;
  binaryOverride?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  sourceScripts?: string[];
  preBuild?: boolean;
  terminal?: TerminalMode;
  analyzeConfig?: AnalyzeConfig;
  bazel?: BazelConfig;
  /** Config-level macros (highest priority for ${var:NAME} expansion) */
  macros?: Record<string, string>;
  /** Template/base config id to inherit from */
  template?: string;
  /** If template is set, these override the template's fields */
  overrides?: Partial<RunConfig>;
  /**
   * Force DevContainer on (true) or off (false) for this config.
   * When absent, inherits the global devcontainerAutoDetect setting.
   */
  devcontainer?: boolean;
  /** Source file this config was loaded from */
  _sourceFile?: string;
}

/** A named group containing multiple run configs. */
export interface Group {
  id: string;
  name: string;
  configs: RunConfig[];
}

/** Global settings merged from all settings sections. */
export interface Settings {
  cmake?: {
    defaultPreset?: string;
    autoRefreshOnChange?: boolean;
    buildDir?: string;
  };
  bazel?: {
    defaultConfig?: string;
    startupFlags?: string[];
    autoRefreshOnChange?: boolean;
  };
  devcontainerAutoDetect?: boolean;
  /** Name substring used to identify the Dev Container in `docker ps` output. */
  devcontainerName?: string;
  debugger?: {
    /** GDB or LLDB. Defaults to 'gdb'. */
    miMode?: 'gdb' | 'lldb';
    /** Absolute path to the debugger binary. */
    debuggerPath?: string;
    /** Stop at the program entry point. */
    stopAtEntry?: boolean;
  };
  analysis?: {
    defaultOutputDir?: string;
    flamegraphScript?: string;
  };
  /** Project-level macros (lowest user-defined precedence) */
  macros?: Record<string, string>;
}

/** The merged workspace model — result of loading and merging all config files. */
export interface WorkspaceModel {
  version?: number;
  groups: Group[];
  ungrouped: RunConfig[];
  settings: Settings;
  /** Macros keyed by source file path, for scope resolution */
  fileMacros: Map<string, Record<string, string>>;
}

/** Raw file-level structure as parsed from YAML/JSON (before merging). */
export interface RawFile {
  version?: number;
  groups?: RawGroup[];
  ungrouped?: RawRunConfig[];
  settings?: Settings;
  /** Path of the file this was loaded from */
  _filePath: string;
}

export interface RawGroup {
  id: string;
  name: string;
  configs?: RawRunConfig[];
}

/** Raw config as parsed from YAML/JSON — all fields are optional at parse time. */
export type RawRunConfig = Partial<RunConfig> & { id: string };

/** A discovered CMake or Bazel build target. */
export interface BuildTarget {
  name: string;
  label?: string;     // Bazel label, e.g. //pkg:target
  kind: TargetKind;
  binaryPath?: string;
  buildSystem: BuildSystem;
}

/** State for the status bar / active config tracking. */
export interface ActiveConfigState {
  groupId?: string;
  configId: string;
  lastRunAt?: Date;
  lastExitCode?: number;
}

/** Entry in the run history. */
export interface RunHistoryEntry {
  configId: string;
  configName: string;
  startedAt: Date;
  exitCode?: number;
  durationMs?: number;
  buildStatus?: 'success' | 'failed' | 'skipped';
}
