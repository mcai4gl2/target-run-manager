import { parseCMakeLists } from '../../import/cmake';

describe('parseCMakeLists', () => {
  // ── add_executable ────────────────────────────────────────────────────────

  it('parses a simple add_executable', () => {
    const content = 'add_executable(order_book main.cpp)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: 'order_book',
      label: 'order_book',
      kind: 'executable',
      buildSystem: 'cmake',
    });
  });

  it('parses add_executable with leading whitespace before name', () => {
    const content = 'add_executable(  my_app  main.cpp  util.cpp)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my_app');
  });

  it('parses multi-line add_executable', () => {
    const content = `add_executable(\n  order_book\n  main.cpp\n  other.cpp\n)`;
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('order_book');
  });

  it('parses names with underscores and digits', () => {
    const content = 'add_executable(my_order_book_v2 main.cpp)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('my_order_book_v2');
  });

  it('parses names with dots and hyphens', () => {
    const content = 'add_executable(app.bin main.cpp)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('app.bin');
  });

  // ── add_test ──────────────────────────────────────────────────────────────

  it('parses add_test with NAME form', () => {
    const content = 'add_test(NAME order_book_tests COMMAND order_book_tests)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: 'order_book_tests',
      label: 'order_book_tests',
      kind: 'test',
      buildSystem: 'cmake',
    });
  });

  it('parses multi-line add_test', () => {
    const content = `add_test(\n  NAME\n  order_book_tests\n  COMMAND order_book_tests\n)`;
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('order_book_tests');
  });

  it('does NOT parse add_test without NAME keyword (simple form)', () => {
    // Per spec: only the NAME form is supported
    const content = 'add_test(order_book_tests order_book_tests)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(0);
  });

  // ── Ignored rules ─────────────────────────────────────────────────────────

  it('ignores add_library', () => {
    const content = 'add_library(order_book_lib SHARED lib.cpp)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(0);
  });

  it('ignores add_custom_target', () => {
    const content = 'add_custom_target(run COMMAND my_app)';
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(0);
  });

  // ── Multiple targets ──────────────────────────────────────────────────────

  it('parses multiple executables and a test', () => {
    const content = [
      'add_executable(order_book main.cpp)',
      'add_executable(order_book_bench bench.cpp)',
      'add_test(NAME order_book_tests COMMAND order_book_tests)',
    ].join('\n');
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.name)).toEqual([
      'order_book',
      'order_book_bench',
      'order_book_tests',
    ]);
    expect(targets.map((t) => t.kind)).toEqual(['executable', 'executable', 'test']);
  });

  it('deduplicates targets with the same name', () => {
    const content = [
      'add_executable(order_book main.cpp)',
      'add_executable(order_book other.cpp)',
    ].join('\n');
    const targets = parseCMakeLists(content);
    expect(targets).toHaveLength(1);
  });

  it('returns empty array for empty content', () => {
    expect(parseCMakeLists('')).toHaveLength(0);
  });

  it('returns empty array when no matching rules', () => {
    const content = `
cmake_minimum_required(VERSION 3.20)
project(MyProject)
find_package(Boost REQUIRED)
add_library(mylib STATIC lib.cpp)
    `.trim();
    expect(parseCMakeLists(content)).toHaveLength(0);
  });
});
