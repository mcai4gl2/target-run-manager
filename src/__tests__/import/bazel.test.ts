import * as path from 'path';
import { parseBuildFile } from '../../import/bazel';

const WORKSPACE_ROOT = '/workspace';

// Helper to create a file path inside the fake workspace
function wp(...parts: string[]): string {
  return path.join(WORKSPACE_ROOT, ...parts);
}

describe('parseBuildFile', () => {
  // ── cc_binary ─────────────────────────────────────────────────────────────

  it('parses cc_binary', () => {
    const content = `cc_binary(\n  name = "server",\n  srcs = ["main.cc"],\n)`;
    const targets = parseBuildFile(content, wp('src', 'app', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: 'server',
      label: '//src/app:server',
      kind: 'executable',
      buildSystem: 'bazel',
    });
  });

  it('parses cc_binary with single-quoted name', () => {
    const content = `cc_binary(name = 'my_tool', srcs = ['main.cc'])`;
    const targets = parseBuildFile(content, wp('tools', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my_tool');
  });

  // ── cc_test ───────────────────────────────────────────────────────────────

  it('parses cc_test', () => {
    const content = `cc_test(\n  name = "server_test",\n  srcs = ["server_test.cc"],\n)`;
    const targets = parseBuildFile(content, wp('src', 'app', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: 'server_test',
      label: '//src/app:server_test',
      kind: 'test',
      buildSystem: 'bazel',
    });
  });

  // ── py_binary ─────────────────────────────────────────────────────────────

  it('parses py_binary', () => {
    const content = `py_binary(\n  name = "helper",\n  srcs = ["helper.py"],\n)`;
    const targets = parseBuildFile(content, wp('scripts', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: 'helper',
      kind: 'executable',
      buildSystem: 'bazel',
    });
  });

  // ── java_binary ───────────────────────────────────────────────────────────

  it('parses java_binary', () => {
    const content = `java_binary(\n  name = "app",\n  main_class = "com.example.App",\n)`;
    const targets = parseBuildFile(content, wp('java', 'app', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ name: 'app', kind: 'executable' });
  });

  // ── Label construction ────────────────────────────────────────────────────

  it('constructs correct label for nested package', () => {
    const content = `cc_binary(name = "tool")`;
    const targets = parseBuildFile(content, wp('src', 'order_book', 'BUILD'), WORKSPACE_ROOT);
    expect(targets[0].label).toBe('//src/order_book:tool');
  });

  it('constructs correct label for root BUILD file', () => {
    const content = `cc_binary(name = "root_bin")`;
    const targets = parseBuildFile(content, wp('BUILD'), WORKSPACE_ROOT);
    expect(targets[0].label).toBe('//:root_bin');
  });

  it('constructs correct label for BUILD.bazel file', () => {
    const content = `cc_binary(name = "server")`;
    const targets = parseBuildFile(content, wp('src', 'server', 'BUILD.bazel'), WORKSPACE_ROOT);
    expect(targets[0].label).toBe('//src/server:server');
  });

  it('strips workspace root from label', () => {
    const content = `cc_binary(name = "deep")`;
    const targets = parseBuildFile(
      content,
      wp('a', 'b', 'c', 'BUILD'),
      WORKSPACE_ROOT,
    );
    expect(targets[0].label).toBe('//a/b/c:deep');
  });

  // ── Multiple targets ──────────────────────────────────────────────────────

  it('parses multiple targets in the same file', () => {
    const content = `
cc_binary(
  name = "server",
  srcs = ["main.cc"],
)

cc_test(
  name = "server_test",
  srcs = ["test.cc"],
)

py_binary(
  name = "helper",
)
    `.trim();
    const targets = parseBuildFile(content, wp('src', 'app', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(3);
    const names = targets.map((t) => t.name);
    expect(names).toContain('server');
    expect(names).toContain('server_test');
    expect(names).toContain('helper');
  });

  it('deduplicates targets with the same name', () => {
    const content = `cc_binary(name = "dup")\ncc_binary(name = "dup")`;
    const targets = parseBuildFile(content, wp('src', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(1);
  });

  // ── Ignored rules ─────────────────────────────────────────────────────────

  it('ignores cc_library', () => {
    const content = `cc_library(name = "mylib", srcs = ["lib.cc"])`;
    const targets = parseBuildFile(content, wp('src', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(0);
  });

  it('ignores py_library', () => {
    const content = `py_library(name = "utils", srcs = ["utils.py"])`;
    const targets = parseBuildFile(content, wp('src', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(0);
  });

  it('returns empty array for empty content', () => {
    expect(parseBuildFile('', wp('src', 'BUILD'), WORKSPACE_ROOT)).toHaveLength(0);
  });

  it('handles rules without a name attribute gracefully', () => {
    const content = `cc_binary(srcs = ["main.cc"])`;
    const targets = parseBuildFile(content, wp('src', 'BUILD'), WORKSPACE_ROOT);
    expect(targets).toHaveLength(0);
  });
});
