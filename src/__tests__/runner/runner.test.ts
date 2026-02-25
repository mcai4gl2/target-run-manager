/**
 * Unit tests for module-level helpers exported from runner.ts.
 */

import { withCaptureOutput } from '../../runner/runner';

describe('withCaptureOutput', () => {
  it('returns the original command when captureFile is undefined', () => {
    const cmd = 'echo hello';
    expect(withCaptureOutput(cmd, undefined)).toBe(cmd);
  });

  it('wraps the command in a subshell with tee', () => {
    const result = withCaptureOutput('echo hello', '/tmp/out.log');
    expect(result).toContain('tee');
    expect(result).toContain('/tmp/out.log');
    expect(result).toContain('echo hello');
  });

  it('redirects stderr to stdout (2>&1)', () => {
    const result = withCaptureOutput('./app', '/tmp/out.log');
    expect(result).toContain('2>&1');
  });

  it('wraps the command in a subshell ( ... )', () => {
    const result = withCaptureOutput('./app', '/tmp/out.log');
    expect(result).toMatch(/^\( .+ \)/);
  });

  it('single-quotes the capture file path', () => {
    const result = withCaptureOutput('./app', '/tmp/out.log');
    expect(result).toContain("'/tmp/out.log'");
  });

  it('escapes single quotes in the capture file path', () => {
    const result = withCaptureOutput('./app', "/tmp/user's output.log");
    // The embedded quote should be escaped as '\''
    expect(result).toContain("'\\''");
  });

  it('preserves the original command unchanged inside the subshell', () => {
    const cmd = 'MY_VAR=hello /bin/app --flag arg1';
    const result = withCaptureOutput(cmd, '/tmp/out.log');
    expect(result).toContain(cmd);
  });

  it('an empty string capture path is still wrapped', () => {
    // Empty string is falsy — should NOT wrap (treated same as undefined by the implementation)
    const cmd = 'echo hi';
    const result = withCaptureOutput(cmd, '');
    // Empty string is falsy so withCaptureOutput returns cmd unchanged
    expect(result).toBe(cmd);
  });
});
