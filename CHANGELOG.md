# Changelog

All notable changes to **Target Run Manager** are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-02-26

Initial release.

### Added

**Core config system**
- Multi-file YAML/JSON config directory (`.vscode/target-manager/`) with recursive discovery
- Single-file fallback (`.vscode/target-manager.yaml` / `.json`)
- Deep merge of configs from multiple files — groups with the same `id` are merged, settings have depth-based precedence
- Variable expansion: `${workspaceFolder}`, `${buildDir}`, `${preset}`, `${date}`, `${datetime}`, `${gitBranch}`, `${gitHash}`
- Macro system: define `${myVar}` shortcuts in `settings.macros` at project, file, or config scope
- Config validation with duplicate-ID detection and structured error reporting
- File watcher with 300 ms debounce — auto-reloads on any config change

**Sidebar UI**
- Activity Bar panel with grouped tree view (Groups → Configs)
- Inline action buttons per config: Run ▶, Build 🔨, Debug 🐞, Edit ✏
- Context menu: Clone, Move to Group, Delete
- Add / Rename / Delete groups
- Status bar showing the active config; click to quick-switch
- Re-run last command from the status bar or keyboard shortcut

**Run modes**
- **Run** — builds (optionally) then executes in an integrated terminal
- **Debug** — launches a `cppdbg` GDB/LLDB session via `vscode.debug.startDebugging()` — no `launch.json` required
- **Test** — CMake: `ctest -R ^<target>$`; Bazel: `bazel test --test_output=all`
- **Analyze** — wraps binary with Valgrind, perf, gprof, heaptrack, strace, or a custom command
- **Coverage** — CMake: runs binary then `gcovr --html-details`; Bazel: `bazel coverage --collect_code_coverage`

**CMake support**
- Target discovery via CMake File API (codemodel-v2)
- Preset-based build config (`cmake --build --preset <name>`)
- CTest integration with per-target filter

**Bazel support**
- Target discovery via `bazel query 'kind(".*_binary", //...)'` and `'kind(".*_test", //...)'`
- Full Bazel label syntax (`//pkg:target`, `@ws//pkg:target`)
- Startup flags, `--config=`, extra build flags, `--run_under`, `--test_filter`
- Binary resolution via `bazel-bin/<package>/<target>` convention

**Config editor**
- Webview form panel for creating and editing configs without touching YAML
- All fields editable: name, build system, target, build config, run mode, args, env, cwd, source scripts, analysis config, terminal mode, DevContainer flag

**Analysis tools**
- Valgrind: memcheck, helgrind, callgrind, massif
- Linux perf: record + stat; post-process with flamegraph script
- gprof: run + `gprof <binary> gmon.out`
- heaptrack: record + `heaptrack_gui` or `heaptrack_print`
- strace: with configurable `-e` expression
- Custom: arbitrary pre/post commands with configurable output directory

**Compound configs**
- `compounds` section in any config file
- Sequential or parallel execution of multiple configs by ID
- Compounds appear alongside regular configs in the sidebar

**Advanced features**
- Output capture: wrap any command with `tee` via `captureOutput` field
- Source scripts: `. script.sh` sourced before command execution
- DevContainer: auto-detect via environment variables + `docker ps`; wrap commands with `docker exec`
- Per-config DevContainer override (`devcontainer: true/false`)
- Run history tracking (last 50 runs, in-memory)
- Terminal mode: `dedicated` (new terminal per run), `shared` (reuse one terminal), `reuse` (reuse last)

**Keyboard shortcuts**
- `Ctrl+F5` — Run active config
- `Ctrl+Shift+R` — Switch active config (quick-pick)
- `Ctrl+Shift+L` — Re-run last command

**Extension settings**
- `targetRunManager.cmake.defaultPreset`
- `targetRunManager.cmake.autoRefreshOnChange`
- `targetRunManager.devcontainerAutoDetect`
