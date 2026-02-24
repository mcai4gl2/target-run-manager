# VS Code Extension Plan: Target Run Manager

> Supports **CMake** and **Bazel** build systems. Designed to be extensible to others.

## Problem with the Current Approach

`update_vscode_configs.py` has fundamental limitations:
- Configuration lives as `# vscode:` comments in `CMakeLists.txt` — hard to manage many variants per target
- One config per target/preset — no way to say "run this binary with test data vs real data"
- Must re-run the script manually to regenerate; no live UI
- `launch.json` / `tasks.json` become enormous flat files with no logical grouping
- No concept of "App X = target A + target B + specific env"
- No support for Bazel projects

---

## Core Data Model

Three levels of hierarchy:

```
Workspace
└── Group  (e.g. "Order Book", "Benchmarks", "Ungrouped")
    └── Run Config  (named, per-target, with all execution details)
        ├── build system: cmake | bazel | manual
        ├── target name  (CMake target name  OR  Bazel label //pkg:target  OR  empty if manual)
        ├── target kind: executable | test | benchmark
        ├── build config (cmake: preset string; bazel: --config flag; manual: n/a)
        ├── run mode: run | debug | test | analyze | coverage
        ├── analyze config (only when run mode = analyze — see Analysis Mode section)
        ├── binary override: explicit path to binary (overrides build system lookup)
        ├── args: string[]
        ├── env: {KEY: VALUE, ...}
        ├── cwd: string (default: ${workspaceFolder})
        ├── source_scripts: string[]  ← shell scripts to source before executing
        └── pre_build: bool (build before run)
```

The source of truth is a **config directory** `.vscode/target-manager/` containing one or more
`.yaml`, `.yml`, or `.json` files, merged at load time. A single-file fallback
(`.vscode/target-manager.yaml` / `.json`) is also supported for simple projects.

---

## Config File Organization

### Directory Layout

```
.vscode/target-manager/          ← config directory (preferred)
├── settings.yaml                ← global settings (optional, any file can carry settings)
├── order-book.yaml              ← one or more groups for the order book subsystem
├── benchmarks.yaml
├── bazel/                       ← subdirectory — all files discovered recursively
│   ├── app.yaml
│   └── services.yaml
├── analysis/
│   └── profiling.yaml           ← analysis-mode configs kept separate
└── local.yaml                   ← personal overrides; add to .gitignore
```

Single-file fallback (for simple projects — also fully supported):
```
.vscode/target-manager.yaml      ← checked first if directory doesn't exist
.vscode/target-manager.json      ← checked second
```

### File Format

Every file — at any depth — shares the same schema. Each file may define any combination of
`groups`, `ungrouped`, and `settings`. None of the keys are required; an empty file is valid.

**YAML** (preferred — supports comments, less punctuation):
```yaml
# order-book.yaml
groups:
  - id: grp-order-book
    name: Order Book
    configs:
      - id: cfg-ob-run-debug
        name: Run (debug)
        buildSystem: cmake
        # ...
```

**JSON** (also accepted — useful for programmatic generation):
```json
{
  "groups": [{ "id": "grp-order-book", "name": "Order Book", "configs": [] }]
}
```

Both formats can coexist in the same directory.

### Merge Semantics

The extension loads all files (depth-first, alphabetical within each directory) and merges them:

| Element | Merge rule |
|---|---|
| `groups` | All groups from all files are collected. Groups with the **same `id`** across files are deep-merged (configs lists concatenated). Groups with different IDs coexist. |
| `ungrouped` | All ungrouped configs from all files are concatenated into one list. |
| `settings` | Deep-merged. More specific files (deeper subdirectory) take precedence over shallower ones. Root `settings.yaml` has lowest precedence. |
| Duplicate config `id` | Warning shown in the extension output panel; the first occurrence wins. |

### Load Order and Precedence

```
workspace root .vscode/target-manager/
  ├── (depth 0 files loaded first, alphabetically)
  └── subdir/
        └── (depth 1 files loaded next, alphabetically within subdir)
```

Deeper files override `settings` keys of shallower files. Group/config lists are always
additive regardless of depth.

### Practical Patterns

**Per-subsystem split** — one file per component:
```
order-book.yaml        benchmarks.yaml        tests.yaml
```

**Team vs personal** — committed files + gitignored personal overrides:
```
# .gitignore
.vscode/target-manager/local*.yaml
.vscode/target-manager/personal/
```

**Analysis configs separated** — keep noisy tool configs out of the main file:
```
order-book.yaml          ← run + debug configs
analysis/order-book.yaml ← valgrind/perf configs for the same targets
```

**Bazel in a subdirectory** — visually distinct from CMake configs:
```
cmake/app.yaml
bazel/app.yaml
```

---

## UI Layout

### Activity Bar Panel — "Target Run Manager"

```
Target Run Manager                             [+Group] [↺ Refresh]
─────────────────────────────────────────────────────────────────
📁 Order Book                                  [▶ Run All] [...]
   ├─ ▶ Run — debug (default args)             [▶] [🐞] [🔨] [⋯]
   ├─ ▶ Run — release (with perf data)         [▶] [🐞] [🔨] [⋯]
   └─ 🧪 Unit Tests — debug                    [▶] [🐞] [🔨] [⋯]

📁 Benchmarks                                  [▶ Run All] [...]
   ├─ ▶ bench_sorted_vec_map [RELEASE]         [▶] [🔨] [⋯]
   └─ ▶ decimal_bench [RELEASE]               [▶] [🔨] [⋯]

📦 Ungrouped
   ├─ 🧪 completer_test [DEBUG]               [▶] [🐞] [🔨] [⋯]
   └─ ...
```

Each row's inline buttons:
- `▶` Run in terminal
- `🐞` Launch debugger (GDB/LLDB)
- `🔨` Build only
- `🔬` Analyze (runs configured analysis tool — valgrind, perf, etc.)
- `⋯` Context menu: Edit, Clone, Move to Group, Delete, Copy as launch.json snippet

### Status Bar

```
[ ▶ Run — Order Book / debug ]   [ ↺ ]
```

Shows the "active" config. Click to quick-switch. The `↺` button re-runs the last config.

---

## Config Editor (Webview or inline form)

Clicking "Edit" or "Add Config" opens a rich form panel (not raw JSON):

| Field | Input type |
|---|---|
| Name | text |
| Build System | radio: CMake / Bazel / Manual |
| Target | dropdown (populated from discovered targets for CMake/Bazel; empty for Manual) |
| Build Config | dropdown: CMake preset OR Bazel `--config` flag |
| Run Mode | radio: Run / Debug / Test / Analyze / Coverage |
| Binary Override | path picker (optional; bypasses build-system binary lookup) |
| Args | token list (add/remove individually, supports `${var}` hints) |
| Environment | key-value table (add/remove rows, import from `.env` file) |
| Working Directory | path picker (with `${workspaceFolder}` etc.) |
| Source Scripts | ordered list of paths (executed as `. script.sh` before run) |
| Analysis Config | collapsible section — visible only when Run Mode = Analyze (see below) |
| Build Before Run | checkbox |
| Terminal | radio: Dedicated / Shared / Reuse Last |
| DevContainer | checkbox (auto-detect or force) |

---

## Feature Spec

### 1. Build System Abstraction

The extension uses a **provider interface** so CMake and Bazel (and future systems) are interchangeable:

```
BuildSystemProvider
  ├── discoverTargets()  → Target[]
  ├── buildTarget(target, config)
  ├── resolveBinaryPath(target, config)  → string
  ├── runTarget(target, config, args, env)
  └── runTests(target, config, args, env)
```

Each config carries a `buildSystem` field (`cmake` | `bazel` | `manual`). The runner selects the
right provider at execution time. A `manual` config skips build entirely and uses `binaryOverride`
as the executable path.

---

### 2. CMake Target Discovery

- Uses **CMake File API** (codemodel-v2), same as existing script — no subprocess parsing fragility
- Discovers executables, CTest tests, benchmarks
- Runs against the currently configured preset (user-selectable)
- Auto-refreshes when any `CMakeLists.txt` in workspace changes (file watcher)
- Unrecognized targets can still be manually added

### 3. Bazel Target Discovery

- Runs `bazel query 'kind(".*_binary", //...)'` to find runnable targets
- Runs `bazel query 'kind(".*_test", //...)'` to find test targets
- Bazel labels are used as target names: `//projects/order_book:main`
- Build config maps to a Bazel `--config=` flag (e.g. `--config=opt`, `--config=dbg`)
- Auto-refreshes when any `BUILD` / `BUILD.bazel` / `WORKSPACE` file changes
- Binary location resolved as `bazel-bin/<package>/<target>` (or via `bazel cquery`)
- Supports `bazel run`, `bazel test`, `bazel build` commands
- Bazel startup flags and per-target `--test_arg` / `--run_under` flags configurable

**Bazel-specific config fields:**

| Field | Example | Notes |
|---|---|---|
| Target label | `//src/app:server` | Full Bazel label |
| Config flag | `dbg` | Passed as `--config=dbg` |
| Startup flags | `--output_base=/tmp/bazel` | Before the command |
| Extra build flags | `--copt=-O0` | Appended to `bazel build` |
| `--run_under` | `valgrind` | Bazel native analysis wrapper |
| Test filter | `--test_filter=MyTest*` | Passed through to test runner |

---

### 4. Groups

- Create / rename / delete groups
- Drag-and-drop configs between groups (VS Code tree DnD API)
- **"Run All"** action: runs every config in a group sequentially or in parallel (user choice)
- Collapse/expand persisted across sessions

### 5. Run Modes

| Mode | What it does |
|---|---|
| **Run** | Builds target, runs in integrated terminal |
| **Debug** | Builds with debug symbols, launches `cppdbg` (GDB/LLDB) session |
| **Test** | CMake: `ctest -R ^<name>$`; Bazel: `bazel test //label`; both with output-on-failure |
| **Analyze** | Wraps binary with a configurable analysis tool (see Analysis Mode below) |
| **Coverage** | CMake: rebuilds with `coverage` preset; Bazel: `--collect_code_coverage`; opens HTML report |

### 6. Analysis Mode (Analyze Run Mode)

When a config's `runMode` is `analyze`, an **Analysis Config** sub-object defines how to wrap the
binary. This is separate from the main run config so you can have e.g. "Run (debug)" and
"Valgrind memcheck" and "Perf flamegraph" as three distinct configs for the same target.

#### Binary Location

The extension resolves the binary path in this priority order:
1. `binaryOverride` — explicit absolute or `${var}`-expanded path (highest priority)
2. Build system lookup — `resolveBinaryPath(target, buildConfig)` from the provider
3. Prompt user if neither is available

`binaryOverride` is essential for:
- Manually built or pre-existing binaries not in a CMake/Bazel project
- Binaries produced by a custom build step not tracked by the extension
- Running analysis on a third-party binary

#### Supported Analysis Tools

| Tool | Sub-modes | Output |
|---|---|---|
| **valgrind** | memcheck, callgrind, massif, helgrind, drd | XML/log file |
| **perf** | record + report, stat, annotate | `perf.data`, flamegraph SVG |
| **gprof** | — (needs `-pg` compile flag, maps to `instr` preset) | `gmon.out` → annotated report |
| **heaptrack** | — | `heaptrack.<pid>.zst` → HTML |
| **strace** | — | syscall trace log |
| **ltrace** | — | library call trace log |
| **custom** | user-defined command template | user-defined |

#### Analysis Config Fields

```json
"analyzeConfig": {
  "tool": "valgrind",
  "subTool": "callgrind",
  "toolArgs": ["--callgrind-out-file=${outputDir}/callgrind.out"],
  "outputDir": "${workspaceFolder}/out/analysis/${date}",
  "binaryOverride": "",
  "postProcess": "kcachegrind ${outputDir}/callgrind.out",
  "openReport": true
}
```

| Field | Description |
|---|---|
| `tool` | Analysis tool: `valgrind` \| `perf` \| `gprof` \| `heaptrack` \| `strace` \| `ltrace` \| `custom` |
| `subTool` | Tool-specific sub-mode (e.g. `memcheck`, `callgrind`, `massif` for valgrind; `record`, `stat` for perf) |
| `toolArgs` | Extra args passed directly to the analysis tool (before the binary) |
| `outputDir` | Directory for output files; created automatically; supports `${var}` expansion |
| `binaryOverride` | Explicit binary path — bypasses build system resolution entirely |
| `postProcess` | Shell command to run after analysis completes (e.g. generate flamegraph, open kcachegrind) |
| `openReport` | Auto-open the output file/URL when analysis finishes |
| `customCommand` | Full command template when `tool = custom`: e.g. `"my-tool {binaryArgs} -- {binary} {args}"` |

#### Valgrind Sub-tool Presets

| Sub-tool | Auto toolArgs added |
|---|---|
| `memcheck` | `--leak-check=full --show-leak-kinds=all --track-origins=yes --xml=yes --xml-file=...` |
| `callgrind` | `--callgrind-out-file=... --collect-jumps=yes` |
| `massif` | `--massif-out-file=... --pages-as-heap=yes` |
| `helgrind` | `--history-level=full` |
| `drd` | `--check-stack-var=yes` |

#### Perf Sub-tool Presets

| Sub-tool | Command generated |
|---|---|
| `record` | `perf record -g -F 99 -o ${outputDir}/perf.data -- {binary} {args}` then auto-runs `perf script \| flamegraph.pl > out.svg` |
| `stat` | `perf stat -e cycles,instructions,cache-misses -- {binary} {args}` |
| `annotate` | `perf record + perf annotate` (requires debug symbols) |

#### Custom Tool Template

When `tool = custom`, the `customCommand` field is a template string with these placeholders:

| Placeholder | Expands to |
|---|---|
| `{binary}` | Resolved binary path |
| `{args}` | Config's program args as a string |
| `{env}` | `KEY=VALUE KEY=VALUE ...` prefix string |
| `{outputDir}` | Resolved output directory |
| `{cwd}` | Working directory |

Example — wrapping with `time`:
```json
"customCommand": "/usr/bin/time -v {binary} {args} 2> {outputDir}/time.txt"
```

### 7. Source Scripts

A critical missing feature from the existing tool. A config can list shell scripts to source before running:

```json
"source_scripts": ["./env/dev.sh", "./secrets.sh.gpg.decrypted"]
```

The extension generates: `. ./env/dev.sh && . ./secrets.sh.gpg.decrypted && ./build/debug/my_binary`

Useful for: loading secret env vars, setting up library paths, activating virtual envs, etc.

### 8. Sync to launch.json & tasks.json

- **Explicit sync command** — does not auto-overwrite (prevents surprise diffs)
- Generated entries tagged with a `cmake-manager:generated` marker — identifiable and re-generable
- Non-generated entries preserved exactly
- Also supports **bypass mode**: run directly from extension without touching json files at all

### 9. DevContainer Support

- Auto-detect via `docker ps | grep vsc-cpp-learn-alt` (or `IN_DEV_CONTAINER` env var)
- When detected: all commands routed through `docker exec -u vscode -w /workspaces/cpp-learn-alt <id> <cmd>`
- Status indicator in panel header: `[DevContainer: active]`
- Per-config override: force devcontainer on/off

### 10. Import from CMakeLists.txt Comments

A migration path from the current `# vscode:` tag system:
- Command: **"Import from CMakeLists comments"**
- Scans all `CMakeLists.txt`, finds `# vscode:*` annotations
- Creates corresponding run configs in the extension
- Offers to move them into appropriate groups based on directory structure

### 11. Quick Pick / Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Run active config | `Ctrl+F5` (configurable) |
| Debug active config | `F5` (alongside native debugger) |
| Switch active config | `Ctrl+Shift+R` → fuzzy quick-pick |
| Re-run last | `Ctrl+Shift+L` |
| Build active config's target | `Ctrl+Shift+B` override |

---

## Additional Features

### A. Config Inheritance / Templates

A **base config** (template) can define shared env/args/preset. Child configs inherit and override.
Useful when you have 10 test binaries all needing the same `LD_LIBRARY_PATH`.

```json
{
  "template": "base_debug",
  "overrides": { "args": ["--filter", "MyTest*"] }
}
```

### B. Run History

Last N runs logged with: config name, timestamp, exit code, duration, build status. Accessible via
"Show Run History" tree node or command. Click to re-run an old config (even if it no longer exists).

### C. Compound Configs

Like VS Code's native compound launch, but group-aware. Define "start these configs in sequence/parallel":

```json
{
  "name": "Integration Test Suite",
  "compound": ["start_server", "run_client", "check_logs"],
  "order": "sequential"
}
```

### D. Variable & Macro Expansion

All string fields in a config (args, env values, cwd, paths, sourceScripts, analyzeConfig fields)
are expanded through a pipeline with four scopes, resolved in priority order (highest first):

#### Scope Priority

```
1. Config-level macros       (defined inline on a single config — overrides everything)
2. File/component macros     (defined in settings of the same .yaml file)
3. Project macros            (defined in settings.yaml — lowest user-defined precedence)
4. Built-in extension vars   (computed at runtime, cannot be overridden)
5. VS Code standard vars     (passed through to VS Code API for launch/task generation)
```

#### Syntax

| Syntax | Scope | Example |
|---|---|---|
| `${workspaceFolder}` | VS Code standard | workspace root path |
| `${env:VAR}` | VS Code standard | value of shell env variable |
| `${input:id}` | VS Code standard | prompted user input |
| `${var:NAME}` | User-defined macro | expands project/component macro `NAME` |
| `${buildDir}` | Built-in extension | `${workspaceFolder}/build/<preset>` |
| `${targetBinary}` | Built-in extension | resolved binary path for the config's target |
| `${preset}` | Built-in extension | current CMake preset or Bazel config name |
| `${date}` | Built-in extension | ISO date `2025-02-25` |
| `${datetime}` | Built-in extension | `2025-02-25T14:30:00` |
| `${gitBranch}` | Built-in extension | current git branch name |
| `${gitHash}` | Built-in extension | short commit hash |

The `${var:NAME}` prefix makes user macros unambiguous and avoids clashing with VS Code builtins.

#### Defining Macros

Macros are defined under `settings.macros` in any config file. The scope of a macro is
the file it is defined in (and any files that merge into the same workspace).

**Project-level macros** in `settings.yaml` — available everywhere:
```yaml
# .vscode/target-manager/settings.yaml
settings:
  macros:
    DATA_ROOT: /mnt/nas/datasets
    TEST_FILTER: ""
    SERVER_PORT: "8080"
```

**Component-level macros** in a component file — override project macros for that file's configs:
```yaml
# .vscode/target-manager/order-book.yaml
settings:
  macros:
    DATA_ROOT: "${workspaceFolder}/data/order-book"  # overrides project-level DATA_ROOT
    TEST_FILTER: "OrderBook*"

groups:
  - id: grp-order-book
    name: Order Book
    configs:
      - id: cfg-ob-run
        name: Run (debug)
        args: [--filter, "${var:TEST_FILTER}", --data, "${var:DATA_ROOT}"]
        env:
          PORT: "${var:SERVER_PORT}"  # falls through to project-level macro
```

**Config-level macros** — inline on a single config for one-off overrides:
```yaml
      - id: cfg-ob-run-stress
        name: Run (stress test)
        macros:
          DATA_ROOT: /mnt/nas/stress-corpus   # overrides component + project macros
          TEST_FILTER: "*"
        args: [--filter, "${var:TEST_FILTER}", --data, "${var:DATA_ROOT}"]
```

#### Macro Expansion Rules

- Macros can reference other macros and built-in vars: `DATA_ROOT: "${workspaceFolder}/data"`
- Circular references are detected and reported as an error
- Undefined `${var:NAME}` references emit a warning and are left unexpanded (not silently dropped)
- Expansion is applied lazily at run time, not at load time, so `${date}` is always fresh

### E. Output Capture & Annotations

Optional: capture run stdout/stderr and display inline, with:
- Regex-based highlighting (e.g., doctest `FAILED` lines in red)
- Click-to-navigate for file:line references in output
- Save output to file automatically

### F. CMakeLists.txt Code Lens

When browsing a `CMakeLists.txt`, show inline CodeLens above each `add_executable` / `add_test`:

```
▶ Run  🐞 Debug  🔨 Build  [+ Add Config]
add_executable(order_book_main ...)
```

Clicking "Add Config" opens the config editor pre-populated with that target.

### G. Preset Matrix View

A supplemental view showing all targets × all presets as a grid — quickly see what configs exist vs.
what's missing. Click a cell to create a config for that combination.

---

## Config File Format Examples

Files live under `.vscode/target-manager/`. All are optional and merged at load time.

### settings.yaml — global settings (lowest precedence)

```yaml
# .vscode/target-manager/settings.yaml
version: 1

settings:
  cmake:
    defaultPreset: debug
    autoRefreshOnChange: true
  bazel:
    defaultConfig: dbg
    startupFlags: []
    autoRefreshOnChange: true
  devcontainerAutoDetect: true
  analysis:
    defaultOutputDir: "${workspaceFolder}/out/analysis/${date}"
    flamegraphScript: /usr/local/bin/flamegraph.pl
```

### order-book.yaml — run and debug configs for one subsystem

```yaml
# .vscode/target-manager/order-book.yaml
groups:
  - id: grp-order-book
    name: Order Book
    configs:
      - id: cfg-ob-run-debug
        name: Run (debug)
        buildSystem: cmake
        target: order_book_main
        kind: executable
        buildConfig: debug
        runMode: run
        args: [--mode, sim]
        env:
          LOG_LEVEL: DEBUG
          DATA_DIR: "${workspaceFolder}/data"  # override with /mnt/nas for large datasets
        cwd: "${workspaceFolder}"
        sourceScripts: []
        preBuild: true
        terminal: dedicated

      - id: cfg-ob-run-release
        name: Run (release, live data)
        buildSystem: cmake
        target: order_book_main
        kind: executable
        buildConfig: release
        runMode: run
        args: [--mode, live]
        env:
          LOG_LEVEL: WARN
          DATA_DIR: /mnt/nas/live
        cwd: "${workspaceFolder}"
        preBuild: true
        terminal: dedicated
```

### analysis/order-book.yaml — analysis configs kept separate

```yaml
# .vscode/target-manager/analysis/order-book.yaml
# Analysis configs for order book targets — kept separate to avoid cluttering main config.
groups:
  - id: grp-order-book        # same id as in order-book.yaml — configs are merged in
    name: Order Book
    configs:
      - id: cfg-ob-valgrind
        name: Valgrind memcheck
        buildSystem: cmake
        target: order_book_main
        kind: executable
        buildConfig: debug
        runMode: analyze
        args: [--mode, sim]
        preBuild: true
        analyzeConfig:
          tool: valgrind
          subTool: memcheck   # auto-fills: --leak-check=full --track-origins=yes ...
          toolArgs: []
          outputDir: "${workspaceFolder}/out/analysis/${date}"
          openReport: false

      - id: cfg-ob-perf
        name: Perf flamegraph
        buildSystem: cmake
        target: order_book_main
        kind: executable
        buildConfig: release  # profile optimized build
        runMode: analyze
        args: [--mode, bench]
        preBuild: true
        analyzeConfig:
          tool: perf
          subTool: record
          toolArgs: [-F, "999"]
          outputDir: "${workspaceFolder}/out/perf/${date}"
          # pipe perf output through flamegraph toolchain
          postProcess: >
            perf script | stackcollapse-perf.pl | flamegraph.pl > ${outputDir}/flame.svg
          openReport: true
```

### bazel/app.yaml — Bazel targets in a subdirectory

```yaml
# .vscode/target-manager/bazel/app.yaml
groups:
  - id: grp-bazel-app
    name: Bazel App
    configs:
      - id: cfg-bz-run
        name: Run (opt)
        buildSystem: bazel
        target: "//src/app:server"
        kind: executable
        buildConfig: opt         # passed as --config=opt
        runMode: run
        args: [--port, "8080"]
        env:
          ENV: dev
        preBuild: true
        terminal: dedicated

      - id: cfg-bz-test
        name: All tests
        buildSystem: bazel
        target: "//src/..."
        kind: test
        buildConfig: dbg
        runMode: test
        bazel:
          testFilter: ""         # empty = run all
          extraBuildFlags: [--copt=-O0]
        preBuild: true

      - id: cfg-bz-manual-strace
        name: Analyze vendor binary (strace)
        buildSystem: manual      # no build step — use binaryOverride
        kind: executable
        runMode: analyze
        binaryOverride: /opt/vendor/app/server   # explicit binary path
        args: [--port, "8080"]
        preBuild: false
        analyzeConfig:
          tool: strace
          toolArgs: [-e, "trace=network"]
          outputDir: "${workspaceFolder}/out/strace/${date}"
```

### local.yaml — personal overrides (gitignored)

```yaml
# .vscode/target-manager/local.yaml
# Personal overrides — not committed to source control.
# Add to .gitignore: .vscode/target-manager/local*.yaml

groups:
  - id: grp-order-book
    name: Order Book
    configs:
      - id: cfg-ob-run-debug
        name: Run (debug)
        # Override data dir to point at my local test dataset
        env:
          DATA_DIR: /home/me/testdata/ob_snapshot_2024
```

---

## Implementation Architecture

```
target-run-manager/
├── package.json              ← Extension manifest: contributes, activationEvents
├── jest.config.ts            ← Jest config: coverage thresholds, path aliases
├── src/
│   ├── extension.ts          ← activate(), register commands, providers
│   ├── model/
│   │   ├── config.ts         ← RunConfig, AnalyzeConfig, Group, Workspace types
│   │   └── storage.ts        ← Config write (single file or multi-file, YAML/JSON)
│   ├── loader/
│   │   ├── discovery.ts      ← Recursively find .yaml/.yml/.json under target-manager/
│   │   ├── parser.ts         ← Parse YAML or JSON → internal model (js-yaml dependency)
│   │   ├── merger.ts         ← Merge multiple parsed files: groups deep-merge, settings precedence
│   │   ├── validator.ts      ← Schema validation, duplicate ID detection, warnings
│   │   └── watcher.ts        ← fs.watch on target-manager/ dir, re-trigger load on change
│   ├── variables/
│   │   ├── expander.ts       ← Entry point: expand all ${...} and ${var:...} in a value/object
│   │   ├── macros.ts         ← Macro scope resolution (config > file > project), cycle detection
│   │   └── builtins.ts       ← Built-in vars: ${buildDir}, ${date}, ${gitBranch}, etc.
│   ├── build/
│   │   ├── provider.ts       ← BuildSystemProvider interface
│   │   ├── cmake/
│   │   │   ├── fileApi.ts    ← CMake File API client (codemodel-v2)
│   │   │   ├── discovery.ts  ← Target discovery, CTest enumeration
│   │   │   └── provider.ts   ← CMakeBuildProvider implements BuildSystemProvider
│   │   ├── bazel/
│   │   │   ├── query.ts      ← bazel query wrapper, label parsing
│   │   │   ├── discovery.ts  ← Target discovery via bazel query
│   │   │   └── provider.ts   ← BazelBuildProvider implements BuildSystemProvider
│   │   └── manual/
│   │       └── provider.ts   ← ManualProvider (no-op build, binaryOverride required)
│   ├── analysis/
│   │   ├── analyzer.ts       ← Dispatches to tool-specific runners
│   │   ├── tools/
│   │   │   ├── valgrind.ts   ← Valgrind command builder (memcheck/callgrind/massif/helgrind/drd)
│   │   │   ├── perf.ts       ← Perf command builder (record/stat/annotate) + flamegraph post-process
│   │   │   ├── heaptrack.ts  ← Heaptrack command builder
│   │   │   ├── strace.ts     ← strace / ltrace command builder
│   │   │   └── custom.ts     ← Custom template expander
│   │   └── output.ts         ← Output dir management, report opener
│   ├── container/
│   │   └── devcontainer.ts   ← Docker exec wrapping (shared by all providers)
│   ├── providers/
│   │   ├── treeProvider.ts   ← TreeDataProvider for sidebar
│   │   └── codeLensProvider.ts ← CodeLens for CMakeLists.txt + BUILD files
│   ├── runner/
│   │   ├── runner.ts         ← Orchestrates build → resolve binary → run/analyze
│   │   ├── launcher.ts       ← launch.json generation + direct vscode.debug.startDebugging()
│   │   └── taskRunner.ts     ← tasks.json generation + direct terminal execution
│   ├── ui/
│   │   ├── configEditor.ts   ← Webview panel for editing configs
│   │   ├── quickPick.ts      ← Quick-pick UI for switching active config
│   │   └── statusBar.ts      ← Status bar item
│   └── importer.ts           ← Import from CMakeLists vscode: comments
├── src/__tests__/            ← Unit tests mirror src/ structure
│   ├── loader/
│   │   ├── parser.test.ts    ← YAML/JSON parsing, schema validation
│   │   ├── merger.test.ts    ← Group deep-merge, settings precedence, duplicate ID handling
│   │   └── validator.test.ts ← Required fields, type errors, circular macro refs
│   ├── variables/
│   │   ├── expander.test.ts  ← End-to-end expansion with all scopes
│   │   ├── macros.test.ts    ← Scope priority, override chain, cycle detection
│   │   └── builtins.test.ts  ← Built-in var resolution
│   ├── analysis/
│   │   └── tools/
│   │       ├── valgrind.test.ts  ← Command string generation for each sub-tool
│   │       ├── perf.test.ts
│   │       └── custom.test.ts    ← Template placeholder expansion
│   └── build/
│       ├── cmake/
│       │   └── merger.test.ts    ← CMake File API response parsing
│       └── bazel/
│           └── query.test.ts     ← bazel query output parsing, label validation
└── webview/                  ← Config editor HTML/CSS/JS (or React)
```

**Technology:**
- TypeScript (standard for VS Code extensions)
- `vscode` API: `TreeDataProvider`, `WebviewPanel`, `CodeLensProvider`, `StatusBarItem`, `Terminal`
- `js-yaml` — single npm dependency for YAML parsing/serialization
- `jest` + `ts-jest` for unit tests; `@vscode/test-cli` for integration tests
- Shell out to `cmake`, `ctest`, `bazel`, `valgrind`, `perf`, `docker` via `child_process`

---

## Development Phases

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — CMake Core** | Config directory loader (multi-file YAML/JSON, merge, watch), variable/macro expander, CMake target discovery (File API), TreeView with groups/configs, Run + Build actions in terminal | ✅ **COMPLETE** (2026-02-25) |
| **Phase 2 — Config Editor** | Webview form editor, CRUD, clone, move to group, binary override field, macro editor | ✅ **COMPLETE** (2026-02-25) |
| **Phase 3 — Analysis Mode** | Valgrind + perf runners, output dir management, post-process commands, `binaryOverride` for manual binaries | ⬜ Not started |
| **Phase 4 — Debugger + DevContainer** | Direct `vscode.debug.startDebugging()` without touching `launch.json`, Docker exec wrapping | ⬜ Not started |
| **Phase 5 — Bazel** | `bazel query` discovery, BazelBuildProvider, Bazel-specific config fields, BUILD file CodeLens | ⬜ Not started |
| **Phase 6 — CodeLens + Import** | CMakeLists.txt + BUILD file CodeLens, import from `# vscode:` comments | ⬜ Not started |
| **Phase 7 — Advanced** | Source scripts, compound configs, run history, preset/config matrix view, output capture, heaptrack/strace tools | ⬜ Not started |

Tests and CI are developed alongside each phase, not deferred — see Testing Strategy below.

### Phase 1 — Implementation Details

**Completed 2026-02-25.** All deliverables implemented with 95 unit tests passing, ≥80% coverage across all modules.

#### Files Created

| File | Description |
|---|---|
| `package.json` | Extension manifest with commands, views, keybindings, menus, configuration |
| `tsconfig.json` / `tsconfig.test.json` | TypeScript compiler config |
| `jest.config.ts` | Jest config with ts-jest, vscode mock, 80%/75% coverage thresholds |
| `.eslintrc.json` | ESLint rules |
| `.gitignore` / `.vscodeignore` | Ignore patterns |
| `.github/workflows/ci.yml` | CI: lint + typecheck + test on push/PR |
| `.github/workflows/release.yml` | Release: build + test + publish to VS Code Marketplace + Open VSX |
| `src/model/config.ts` | All TypeScript types: `RunConfig`, `Group`, `WorkspaceModel`, etc. |
| `src/model/storage.ts` | Config writer (YAML serialization back to disk) |
| `src/loader/discovery.ts` | Recursive file discovery under `.vscode/target-manager/` |
| `src/loader/parser.ts` | YAML/JSON parser → `RawFile` (uses js-yaml) |
| `src/loader/merger.ts` | Multi-file merge: same-id groups deep-merged, settings precedence |
| `src/loader/validator.ts` | Schema validation, duplicate ID detection |
| `src/loader/watcher.ts` | `fs.watch`-based config file watcher with 300ms debounce |
| `src/variables/builtins.ts` | Built-in vars: `${buildDir}`, `${date}`, `${datetime}`, `${gitBranch}`, `${gitHash}`, `${preset}`, `${targetBinary}` |
| `src/variables/macros.ts` | Macro scope resolution (config > file > project > builtins) + cycle detection |
| `src/variables/expander.ts` | Full variable expansion pipeline for strings, arrays, objects |
| `src/build/provider.ts` | `BuildSystemProvider` interface |
| `src/build/cmake/fileApi.ts` | CMake File API (codemodel-v2) client |
| `src/build/cmake/discovery.ts` | CMake target discovery + CTest enumeration |
| `src/build/cmake/provider.ts` | `CMakeBuildProvider` — build, run, test commands |
| `src/build/manual/provider.ts` | `ManualBuildProvider` — no-op build, uses `binaryOverride` |
| `src/providers/treeProvider.ts` | `TargetRunManagerTreeProvider` — sidebar tree with group/config nodes |
| `src/runner/taskRunner.ts` | Terminal runner (dedicated/shared/reuse modes) |
| `src/runner/runner.ts` | Main orchestrator: build → resolve binary → run/test in terminal |
| `src/ui/statusBar.ts` | Status bar item showing active config |
| `src/ui/quickPick.ts` | Quick-pick for switching active config |
| `src/extension.ts` | Extension entry point: activate, register all providers + commands |
| `src/__tests__/loader/discovery.test.ts` | 8 tests |
| `src/__tests__/loader/parser.test.ts` | 14 tests |
| `src/__tests__/loader/merger.test.ts` | 13 tests |
| `src/__tests__/loader/validator.test.ts` | 11 tests |
| `src/__tests__/variables/builtins.test.ts` | 12 tests |
| `src/__tests__/variables/macros.test.ts` | 15 tests |
| `src/__tests__/variables/expander.test.ts` | 22 tests |
| `src/__tests__/__mocks__/vscode.ts` | VS Code API mock for Jest |
| `src/__tests__/fixtures/` | YAML fixture files for tests |

#### Coverage (Phase 1)

```
All files      | 91.69% stmts | 82.94% branches | 95.12% funcs | 91.61% lines
```

All thresholds met (≥80% lines/functions, ≥75% branches).

### Phase 2 — Implementation Details

**Completed 2026-02-25.** 120 unit tests passing (+25 vs Phase 1). ≥80% coverage maintained.

#### Files Created / Modified

| File | Change | Description |
|---|---|---|
| `src/model/storage.ts` | Modified | Full CRUD: `saveConfig` (create+update in-place), `deleteConfig`, `cloneConfig`, `moveConfigToGroup`, `addGroup`, `renameGroup`, `deleteGroup` |
| `src/ui/configEditor.ts` | Created | Webview panel with complete HTML/CSS/JS form. All config fields: name, buildSystem (radio), target, buildConfig, kind, runMode (radio), binaryOverride, args (token list), env (kv table), cwd, sourceScripts, preBuild checkbox, terminal (radio), analyzeConfig section (conditional on runMode=analyze, with tool/subtool/toolArgs/outputDir/postProcess/openReport/customCommand), macros editor (kv table) |
| `src/providers/treeProvider.ts` | Modified | Added group tooltip showing config count |
| `src/extension.ts` | Modified | Wired all Phase 2 commands: addGroup, renameGroup, deleteGroup, addConfig, editConfig, cloneConfig, deleteConfig, moveToGroup — all using real implementations |
| `package.json` | Modified | Added renameGroup/deleteGroup/moveToGroup commands; added view/title menu buttons (Add Group, Add Config, Refresh); fixed viewItem context values to match `runConfig`/`group` |
| `src/__tests__/model/storage.test.ts` | Created | 25 tests covering all CRUD operations and configToPlain serialization |

#### Phase 2 Feature Summary

- **Config Editor Webview**: Full-featured form panel with VS Code theme styling. Opens via "Add Config" or "Edit" inline button. Sends `save`/`cancel` messages to extension.
- **Create config**: Opens blank form, saves to primary config file in chosen group or ungrouped.
- **Edit config**: Opens form pre-populated with existing values, updates in-place in the source YAML file.
- **Clone config**: Duplicates with a new ID and "(copy)" suffix, placed in same group.
- **Delete config**: Confirmation dialog → removes from source YAML.
- **Move to Group**: Quick-pick of all groups → updates source file.
- **Group management**: Add Group (prompted name → generates id), Rename Group, Delete Group (refuses if non-empty unless forced).
- **Analysis Config section**: Conditionally shown when runMode=analyze. Supports all 7 tools with dynamic subtool dropdown (valgrind sub-tools, perf sub-tools), custom command template field.
- **Macros editor**: Key-value table for config-level macro overrides.

---

## Testing Strategy

### Framework and Tooling

| Tool | Purpose |
|---|---|
| `jest` + `ts-jest` | Unit tests — pure TypeScript logic with no VS Code API dependency |
| `@vscode/test-cli` | Integration tests — run inside a real VS Code instance |
| `istanbul` / `c8` | Coverage collection (built into Jest via `--coverage`) |
| `@vscode/vsce` | Package the `.vsix` for smoke testing before publish |

### Coverage Target: 80% Line Coverage

Coverage is enforced in `jest.config.ts`:

```typescript
coverageThreshold: {
  global: {
    lines: 80,
    functions: 80,
    branches: 75,   // branches slightly lower — VS Code API paths are hard to mock
  }
}
```

CI fails if coverage drops below threshold. Coverage report is uploaded to Codecov as an artifact.

### What Is Unit Tested (no VS Code API needed)

These modules are pure functions and are the highest-value test targets:

| Module | What to test |
|---|---|
| `loader/parser.ts` | Valid YAML, valid JSON, malformed input, missing required fields, extra unknown fields |
| `loader/merger.ts` | Groups with same ID merge correctly, distinct IDs coexist, settings depth-precedence, config list concatenation, ungrouped merge |
| `loader/validator.ts` | Duplicate config IDs, invalid `runMode`, missing `binaryOverride` on manual configs |
| `variables/macros.ts` | Scope priority chain, component overrides project macro, config overrides component, cycle detection, undefined var warning |
| `variables/expander.ts` | Nested objects expanded recursively, array elements expanded, `${var:X}` replaced, `${workspaceFolder}` passed through |
| `variables/builtins.ts` | `${date}` format, `${preset}` from config, `${buildDir}` construction |
| `analysis/tools/valgrind.ts` | Each sub-tool generates correct flags, custom `toolArgs` appended after presets |
| `analysis/tools/perf.ts` | `record` generates correct perf invocation + post-process command |
| `analysis/tools/custom.ts` | All placeholders `{binary}`, `{args}`, `{outputDir}`, `{cwd}` expanded |
| `build/bazel/query.ts` | Label validation, `bazel query` output parsed into target list |
| `build/cmake/fileApi.ts` | CMake File API JSON response parsed into binary/test lists |

### What Is Integration Tested (requires VS Code instance)

- TreeView renders groups and configs correctly after loading a fixture directory
- Clicking "Run" triggers the correct terminal command
- Config editor webview round-trips: open → edit → save → reload shows updated values
- File watcher: modifying a config file triggers reload in the tree

### Test Fixtures

```
src/__tests__/fixtures/
├── valid-single-file/
│   └── target-manager.yaml
├── multi-file-merge/
│   ├── settings.yaml
│   ├── order-book.yaml
│   └── analysis/order-book.yaml
├── invalid-duplicate-ids/
│   ├── a.yaml
│   └── b.yaml
├── macro-cycles/
│   └── settings.yaml        ← A: "${var:B}", B: "${var:A}"
└── cmake-file-api-responses/
    └── codemodel-v2.json    ← Captured real CMake File API output for parser tests
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### `ci.yml` — runs on every push and pull request

```yaml
on: [push, pull_request]

jobs:
  build-and-test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: ["18", "20"]
    steps:
      - checkout
      - setup Node.js (matrix version)
      - npm ci
      - npm run lint          # eslint + prettier check
      - npm run compile       # tsc --noEmit
      - npm run test          # jest --coverage
      - upload coverage to Codecov
      - npm run package       # vsce package → .vsix (smoke-test that packaging succeeds)
```

#### `release.yml` — runs on `v*` tag push (e.g. `v1.2.3`)

```yaml
on:
  push:
    tags: ["v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup Node.js 20
      - npm ci
      - npm run compile
      - npm run test          # must pass before publishing
      - npm run package       # produces target-run-manager-X.Y.Z.vsix
      - publish to VS Code Marketplace  (uses VSCE_PAT secret)
      - publish to Open VSX Registry    (uses OVSX_PAT secret)
      - create GitHub Release with .vsix as attachment
      - post release notes from CHANGELOG.md
```

### Required GitHub Secrets

| Secret | Used by | Where to get it |
|---|---|---|
| `VSCE_PAT` | `vsce publish` | Azure DevOps Personal Access Token |
| `OVSX_PAT` | `ovsx publish` | Open VSX namespace access token |

### Branch Strategy

- `main` — stable, always passing CI
- `dev` — integration branch for feature work
- Feature branches merge into `dev` via PR; `dev` merges into `main` for releases
- Tags are cut from `main` only

---

## Release Guide

### Versioning

Follow **semver**: `MAJOR.MINOR.PATCH`

- Patch: bug fixes, dependency updates
- Minor: new features, new analysis tools, new build system support
- Major: breaking changes to `.vscode/target-manager/` config schema

Version lives in `package.json`. `CHANGELOG.md` is maintained manually — one entry per release.

---

### Publishing to VS Code Marketplace

**One-time setup:**

1. Create a Microsoft account at https://marketplace.visualstudio.com
2. Create an Azure DevOps organization at https://dev.azure.com
3. Generate a Personal Access Token (PAT):
   - Organization: your org (or `All accessible organizations`)
   - Scopes: **Marketplace → Manage**
   - Expiry: 1 year (renew annually)
4. Install `vsce`: `npm install -g @vscode/vsce`
5. Create a publisher: `vsce create-publisher <your-publisher-name>`
6. Add the PAT to GitHub Secrets as `VSCE_PAT`

**Manual publish (if not using CI):**
```bash
npm run compile && npm run test
vsce package                          # produces .vsix
vsce publish --pat $VSCE_PAT          # reads version from package.json
```

**Pre-release publish** (for early access):
```bash
vsce publish --pre-release --pat $VSCE_PAT
```

---

### Publishing to Open VSX (Cursor, VSCodium, etc.)

Cursor uses the **Open VSX Registry** (https://open-vsx.org) as its extension marketplace.
Publishing here makes the extension available in Cursor, VSCodium, and any other VS Code-compatible
editor that uses Open VSX.

**One-time setup:**

1. Create an account at https://open-vsx.org (sign in with GitHub)
2. Create a namespace matching your publisher name: **Extensions → Create Namespace**
3. Generate an access token: **Settings → Access Tokens → Generate**
4. Add the token to GitHub Secrets as `OVSX_PAT`
5. Install `ovsx`: `npm install -g ovsx`

**Manual publish:**
```bash
ovsx publish target-run-manager-X.Y.Z.vsix --pat $OVSX_PAT
```

> Note: Open VSX does not auto-pull from the VS Code Marketplace. You must publish separately.
> The CI `release.yml` handles both in one job.

---

### Full Release Checklist

```
Before tagging:
  [ ] All tests pass locally (npm run test)
  [ ] Coverage >= 80% (check jest output)
  [ ] CHANGELOG.md updated with new version section
  [ ] package.json version bumped
  [ ] README.md screenshots/docs updated if UI changed
  [ ] Any new config schema fields documented in Config File Organization section

Tagging and publishing:
  [ ] git tag v1.2.3 && git push origin v1.2.3
  [ ] Watch release.yml CI job — both marketplace publish steps must succeed
  [ ] Verify extension appears on https://marketplace.visualstudio.com (may take ~5 min)
  [ ] Verify extension appears on https://open-vsx.org (usually immediate)
  [ ] Install from marketplace in a clean VS Code and smoke test

Post-release:
  [ ] Create GitHub Release (auto-created by release.yml) — review release notes
  [ ] Announce if significant release (if applicable)
  [ ] Bump package.json to next dev version (e.g. 1.2.4-dev)
```

---

### Schema Versioning and Migration

The config file has a top-level `version` field. When a breaking schema change is needed:

1. Bump `version` in the schema (e.g. `1` → `2`)
2. Write a migrator in `src/loader/migrate.ts`: `migrate_v1_to_v2(raw: unknown): unknown`
3. The loader auto-detects the version and applies migrations on load
4. Emit a one-time warning: _"Config migrated from v1 to v2 — please review and save"_
5. Document the migration in `CHANGELOG.md`

---

## Comparison with update_vscode_configs.py

| | `update_vscode_configs.py` | Extension |
|---|---|---|
| Multiple configs per target | No (1 per preset) | Yes |
| Config location | CMakeLists.txt comments | Dedicated JSON, UI-editable |
| Grouping | None | Groups with drag-and-drop |
| Source scripts | No | Yes |
| Refresh trigger | Manual script run | Auto on CMakeLists.txt / BUILD change |
| Navigation | Flat task/launch list | Tree view with hierarchy |
| Debug launch | Via launch.json | Direct, no json required |
| DevContainer | Script flag | Auto-detect, per-config |
| Run history | No | Yes |
| Bazel support | No | Yes |
| Valgrind/perf/strace | External scripts only | Built-in, configurable per config |
| Manual binary (no build system) | No | Yes, via `binaryOverride` |
| Analysis output management | No | Auto output dir, post-process, report open |
| User-defined macros | No | Project + component + config scope |
| Config organization | Single flat file | Multi-file directory, subfolders, gitignored personal overrides |
| Unit test coverage | n/a | ≥80% enforced in CI |
| Marketplace availability | n/a | VS Code Marketplace + Open VSX (Cursor) |
