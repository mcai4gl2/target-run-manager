# Target Run Manager

> Build, run, debug, test, and profile every binary in your C++ workspace — CMake and Bazel, side by side.

Managing dozens of build targets across CMake presets and Bazel configs usually means wrestling with bloated `launch.json` files, custom shell scripts, or re-running the same generator script every time something changes. **Target Run Manager** replaces all of that with a structured sidebar panel, a rich config editor, and a YAML file format that scales from a single binary to a large monorepo.

---

## Features

- **Unified sidebar** — all CMake and Bazel targets in one organized, grouped tree view
- **Five run modes per config** — Run, Debug (GDB/LLDB), Test, Analyze, Coverage
- **Auto-discovery** — CMake File API and `bazel query` keep the target list fresh automatically
- **Rich YAML config format** — version-controlled, multi-file, supports macros and variable expansion
- **In-editor form** — add or edit configs without touching YAML directly
- **Analysis tools** — Valgrind, perf, gprof, heaptrack, strace, and custom wrappers built in
- **Compound configs** — run multiple targets sequentially or in parallel with one click
- **Output capture** — pipe any command's stdout/stderr to a file via `tee`
- **DevContainer support** — transparent `docker exec` wrapping for remote container workflows
- **Status bar integration** — pin an active config, re-run it with a keyboard shortcut
- **Macro system** — define `${myVar}` shortcuts at the project, file, or config level

---

## Requirements

- VS Code 1.85 or later
- At least one of:
  - **CMake** ≥ 3.14 with a configured build directory (for CMake target discovery)
  - **Bazel** on `PATH` (for Bazel target discovery)
- For analysis tools: `valgrind`, `perf`, `gprof`, `heaptrack`, or `strace` must be installed separately

---

## Quick Start

1. Install the extension
2. Open a CMake or Bazel workspace
3. Click the **Target Run Manager** icon in the Activity Bar (▶)
4. Click **Add Configuration** (`+`) to create your first config using the form editor, or
5. Create `.vscode/target-manager/targets.yaml` by hand (see [Configuration](#configuration))

The sidebar populates automatically. Click ▶ next to any config to run it.

---

## Configuration

### Config File Location

The extension looks for config files in this order:

```
<workspaceRoot>/
├── .vscode/
│   ├── target-manager/          ← preferred: directory (all .yaml/.yml/.json files, recursive)
│   │   ├── app.yaml
│   │   ├── tests.yaml
│   │   └── analysis/
│   │       └── perf.yaml
│   ├── target-manager.yaml      ← single-file fallback
│   └── target-manager.json      ← single-file fallback (JSON)
```

All files in the directory are merged at load time. The extension auto-reloads when any of them change.

**Tip:** Add personal overrides to `.gitignore` so teammates don't see your local paths:

```
# .gitignore
.vscode/target-manager/local*.yaml
```

---

### Full Config Reference

```yaml
# .vscode/target-manager/app.yaml

# ── Global settings (optional, can live in any file) ──────────────────────
settings:
  macros:
    dataDir: /mnt/data/test-fixtures   # Available as ${dataDir} in any field
  analysis:
    flamegraphScript: /opt/FlameGraph/flamegraph.pl
  debugger:
    miMode: gdb          # or lldb
    debuggerPath: /usr/bin/gdb
    stopAtEntry: false
  devcontainerAutoDetect: true

# ── Grouped configs ────────────────────────────────────────────────────────
groups:
  - id: grp-order-book
    name: Order Book
    configs:

      # --- Minimal CMake config ---
      - id: cfg-ob-run
        name: Run
        buildSystem: cmake
        target: order_book        # CMake target name
        buildConfig: debug        # CMake preset (cmake --preset debug)
        runMode: run
        args: ["--port", "9090"]
        env:
          LOG_LEVEL: info
        preBuild: true

      # --- Debug with GDB ---
      - id: cfg-ob-debug
        name: Debug
        buildSystem: cmake
        target: order_book
        buildConfig: debug
        runMode: debug            # Launches cppdbg session — no launch.json needed

      # --- Run tests with CTest ---
      - id: cfg-ob-test
        name: Unit Tests
        buildSystem: cmake
        target: order_book_tests
        buildConfig: debug
        runMode: test             # Runs: ctest --test-dir <buildDir> -R ^order_book_tests$

      # --- Valgrind memory check ---
      - id: cfg-ob-valgrind
        name: Valgrind (memcheck)
        buildSystem: cmake
        target: order_book
        buildConfig: debug
        runMode: analyze
        analyzeConfig:
          tool: valgrind
          subtool: memcheck       # memcheck | helgrind | callgrind | massif
          toolArgs: ["--leak-check=full", "--show-leak-kinds=all"]
          openReport: false

      # --- Coverage report ---
      - id: cfg-ob-coverage
        name: Coverage
        buildSystem: cmake
        target: order_book
        buildConfig: coverage     # Should be a preset compiled with --coverage
        runMode: coverage         # Runs binary then: gcovr --html-details out/coverage.html

  - id: grp-benchmarks
    name: Benchmarks
    configs:

      # --- Minimal Bazel config ---
      - id: cfg-bench-bazel
        name: Benchmark Suite
        buildSystem: bazel
        target: "//benchmarks:suite"   # Full Bazel label
        buildConfig: opt               # Passed as --config=opt
        runMode: run
        bazel:
          startupFlags: ["--output_base=/tmp/bazel-cache"]
          extraBuildFlags: ["--copt=-O3"]
          runUnder: ""                 # e.g. "valgrind" — uses bazel run --run_under

      # --- Bazel test with filter ---
      - id: cfg-bench-test
        name: Bazel Tests (fast only)
        buildSystem: bazel
        target: "//benchmarks:..."
        runMode: test
        bazel:
          testFilter: "FastSuite*"     # --test_filter=FastSuite*

# ── Ungrouped configs (no sidebar group) ──────────────────────────────────
ungrouped:
  - id: cfg-manual-tool
    name: External Tool
    buildSystem: manual          # No build step — uses binaryOverride directly
    binaryOverride: /usr/local/bin/my-tool
    runMode: run
    args: ["--config", "${dataDir}/tool.conf"]
    captureOutput: /tmp/tool-output.log   # Wraps command with tee

# ── Compound configs (run multiple configs at once) ────────────────────────
compounds:
  - id: cmp-full-stack
    name: Full Stack
    configs: ["cfg-ob-run", "cfg-bench-bazel"]   # Config IDs
    order: sequential    # or: parallel
```

---

### Key Fields

| Field | Type | Description |
|---|---|---|
| `buildSystem` | `cmake` \| `bazel` \| `manual` | Which build system to use |
| `target` | string | CMake target name or full Bazel label (`//pkg:target`) |
| `buildConfig` | string | CMake preset or Bazel `--config=` flag |
| `runMode` | `run` \| `debug` \| `test` \| `analyze` \| `coverage` | How to execute |
| `args` | string[] | Command-line arguments passed to the binary |
| `env` | `{KEY: VALUE}` | Environment variables prepended to the command |
| `cwd` | string | Working directory (default: `${workspaceFolder}`) |
| `sourceScripts` | string[] | Shell scripts sourced before execution (`. script.sh`) |
| `binaryOverride` | string | Absolute path to binary — skips build-system lookup |
| `preBuild` | bool | Build the target before running (default: false) |
| `captureOutput` | string | File path — wraps command with `tee` to capture stdout+stderr |
| `terminal` | `dedicated` \| `shared` \| `reuse` | Terminal reuse strategy |
| `devcontainer` | bool | Force DevContainer wrapping on or off |

---

### Variable Expansion

Most string fields support `${var}` expansion:

| Variable | Value |
|---|---|
| `${workspaceFolder}` | Absolute path to the workspace root |
| `${buildDir}` | `<workspaceRoot>/build/<buildConfig>` |
| `${preset}` | The value of `buildConfig` |
| `${date}` | Today's date (`YYYYMMDD`) |
| `${datetime}` | Date and time (`YYYYMMDD_HHMMSS`) |
| `${gitBranch}` | Current git branch name |
| `${gitHash}` | Current git commit hash (short) |
| `${myMacro}` | Any macro defined in `settings.macros` |

---

### Analysis Tools

When `runMode: analyze`, an `analyzeConfig` section configures the profiling tool:

| Tool | `tool` value | `subtool` values |
|---|---|---|
| Valgrind | `valgrind` | `memcheck`, `helgrind`, `callgrind`, `massif` |
| Linux perf | `perf` | `record`, `stat` |
| gprof | `gprof` | — |
| heaptrack | `heaptrack` | — |
| strace | `strace` | — |
| Custom | `custom` | — |

```yaml
analyzeConfig:
  tool: perf
  subtool: record
  toolArgs: ["-g", "-F", "99"]
  postProcess: "perf report"   # Run in a second terminal after recording
  outputDir: /tmp/perf-${date} # Default: .vscode/target-manager-output/<configId>/perf/
  openReport: true             # Open flamegraph or report automatically
```

---

## Keybindings

| Shortcut | Action |
|---|---|
| `Ctrl+F5` | Run the active config |
| `Ctrl+Shift+R` | Quick-pick to switch the active config |
| `Ctrl+Shift+L` | Re-run the last command |

All keybindings can be remapped via **File → Preferences → Keyboard Shortcuts**.

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `targetRunManager.cmake.defaultPreset` | `""` | Default CMake preset when none is specified in a config |
| `targetRunManager.cmake.autoRefreshOnChange` | `true` | Reload targets when CMakeLists.txt files change |
| `targetRunManager.devcontainerAutoDetect` | `true` | Auto-detect DevContainer and wrap commands with `docker exec` |

---

## DevContainer Support

When working inside a DevContainer, the extension can transparently wrap terminal commands with `docker exec` so they run inside the container rather than on the host:

- **Auto-detect**: reads `IN_DEV_CONTAINER` / `REMOTE_CONTAINERS` environment variables and `docker ps` output
- **Per-config override**: set `devcontainer: true` or `devcontainer: false` on any config to force the behavior regardless of auto-detection
- **Debug mode**: launching a debugger inside a DevContainer requires manual gdbserver setup; the extension will warn you if you attempt this

---

## Compound Configs

Run multiple configs with one action. Add a `compounds` section to any config file:

```yaml
compounds:
  - id: cmp-integration
    name: Integration Suite
    configs:
      - cfg-server-run
      - cfg-client-run
      - cfg-integration-tests
    order: sequential   # Run one after the other

  - id: cmp-parallel-build
    name: Build Everything
    configs: [cfg-ob-run, cfg-bench-bazel, cfg-manual-tool]
    order: parallel     # Run all at the same time
```

Compound configs appear in the sidebar alongside regular configs.

---

## Tips and Patterns

**Split configs across files by subsystem:**
```
.vscode/target-manager/
├── order-book.yaml      ← production run + debug configs
├── benchmarks.yaml
├── analysis/
│   └── profiling.yaml   ← all analyze-mode configs, kept separate
└── local.yaml           ← personal paths, in .gitignore
```

**Use macros to avoid repeating paths:**
```yaml
settings:
  macros:
    testData: /mnt/nas/test-fixtures/v3
    releasePreset: release-clang-lto

groups:
  - id: grp-integration
    name: Integration Tests
    configs:
      - id: cfg-int-run
        name: Run integration suite
        buildSystem: cmake
        buildConfig: ${releasePreset}
        args: ["--data", "${testData}/suite-a"]
```

**Capture output for later analysis:**
```yaml
- id: cfg-benchmark-capture
  name: Benchmark (capture)
  buildSystem: cmake
  target: bench_suite
  runMode: run
  captureOutput: /tmp/bench-${datetime}.log
```

---

## Contributing

Bug reports and feature requests are welcome — please open an issue on GitHub.

Pull requests are accepted. Before submitting:

```bash
npm install
npm run lint       # ESLint
npm run compile    # TypeScript type check
npm test           # Jest (449 tests, ≥80% coverage required)
```

---

## Releasing

### One-time setup

1. Install `vsce` globally (or use `npx`):
   ```bash
   npm install -g @vscode/vsce
   ```
2. Create a Personal Access Token at `dev.azure.com` (organization: `mcai4gl2`, scope: **Marketplace → Manage**).
3. Log in once:
   ```bash
   vsce login mcai4gl2
   # paste your PAT when prompted
   ```

### Publishing a new version

```bash
# 1. Bump the version (patch | minor | major)
npm version patch          # e.g. 0.1.0 → 0.1.1

# 2. Verify everything is green
npm run lint
npx tsc --noEmit
npm test

# 3. Package (produces target-run-manager-<version>.vsix)
npm run package

# 4. Smoke-test locally
code --install-extension target-run-manager-*.vsix

# 5. Publish to the VS Code Marketplace
vsce publish

# 6. Tag and push so GitHub Actions also records the release
git push && git push --tags
```

To publish to **Open VSX** as well, install `ovsx` and run:
```bash
npm install -g ovsx
ovsx publish target-run-manager-*.vsix --pat <OVSX_PAT>
```

---

## License

MIT — see [LICENSE](LICENSE).
