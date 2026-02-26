import { buildTmuxCommand } from '../../runner/tmux';

describe('buildTmuxCommand', () => {
  it('returns empty string for empty commands array', () => {
    expect(buildTmuxCommand('session', [])).toBe('');
  });

  it('single command: contains new-session, no split-window, no select-layout', () => {
    const cmd = buildTmuxCommand('mysession', ['/bin/server']);
    expect(cmd).toContain('tmux new-session');
    expect(cmd).not.toContain('split-window');
    expect(cmd).not.toContain('select-layout');
  });

  it('single command: attaches to the session', () => {
    const cmd = buildTmuxCommand('mysession', ['/bin/server']);
    expect(cmd).toContain('attach-session');
  });

  it('two commands: one split-window and one select-layout tiled', () => {
    const cmd = buildTmuxCommand('sess', ['/bin/a', '/bin/b']);
    expect(cmd.match(/split-window/g)).toHaveLength(1);
    expect(cmd).toContain('select-layout');
    expect(cmd).toContain('tiled');
  });

  it('three commands: two split-windows', () => {
    const cmd = buildTmuxCommand('sess', ['/bin/a', '/bin/b', '/bin/c']);
    expect(cmd.match(/split-window/g)).toHaveLength(2);
  });

  it('parts are joined with &&', () => {
    const cmd = buildTmuxCommand('sess', ['/bin/a', '/bin/b']);
    expect(cmd).toContain(' && ');
  });

  it('kills any existing session before creating a new one', () => {
    const cmd = buildTmuxCommand('sess', ['/bin/a']);
    expect(cmd).toContain('kill-session');
    // kill-session must come before new-session
    const killIdx = cmd.indexOf('kill-session');
    const newIdx = cmd.indexOf('new-session');
    expect(killIdx).toBeLessThan(newIdx);
  });

  it('sanitises session name — spaces become underscores', () => {
    const cmd = buildTmuxCommand('my session name', ['/bin/a']);
    expect(cmd).toContain('my_session_name');
    expect(cmd).not.toContain('my session name');
  });

  it('sanitises session name — special characters become underscores', () => {
    const cmd = buildTmuxCommand('foo:bar/baz', ['/bin/a']);
    expect(cmd).toContain('foo_bar_baz');
  });

  it('custom layout is passed to select-layout', () => {
    const cmd = buildTmuxCommand('sess', ['/bin/a', '/bin/b'], 'even-horizontal');
    expect(cmd).toContain('even-horizontal');
    expect(cmd).not.toContain('tiled');
  });

  it('default layout is tiled when not specified', () => {
    const cmd = buildTmuxCommand('sess', ['/bin/a', '/bin/b']);
    expect(cmd).toContain('tiled');
  });

  it('single quotes in command are escaped', () => {
    const cmd = buildTmuxCommand('sess', ["FOO='bar' /bin/server"]);
    // Interior single quote must be escaped as '\''
    expect(cmd).toContain("'\\''");
  });

  it('each command is wrapped in single quotes', () => {
    const cmd = buildTmuxCommand('sess', ['/bin/server --port 8080']);
    // The command string should be quoted so spaces don't split it
    expect(cmd).toContain("'/bin/server --port 8080'");
  });
});
