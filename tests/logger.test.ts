// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initLogger, log } from '../backend/util/logger';

/**
 * The logger is a module-level singleton, so these tests share one instance
 * and one temp directory. Re-initialising per test (via beforeEach) churns
 * file handles for no benefit and makes the suite flaky.
 */
let dir: string;
let logPath: string;

const read = (): string => (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '');

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-log-'));
  logPath = initLogger(dir, 'debug')!;
});

afterAll(() => {
  log.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('logger', () => {
  it('creates a log file under the data folder', () => {
    expect(logPath).toContain('logs');
    expect(fs.existsSync(logPath)).toBe(true);
  });

  it('writes messages with a level and scope', () => {
    log.error('download', 'something broke');
    expect(read()).toMatch(/\[ERROR\] \[download\] something broke/);
  });

  it('serialises an Error with its stack', () => {
    log.error('errtest', new Error('boom'));
    expect(read()).toContain('Error: boom');
  });

  it('respects the minimum level', () => {
    log.setLevel('warn');
    log.info('leveltest', 'must-not-appear');
    log.warn('leveltest', 'must-appear');
    log.setLevel('debug');

    const text = read();
    expect(text).not.toContain('must-not-appear');
    expect(text).toContain('must-appear');
  });
});

describe('logger redaction', () => {
  it('masks classic GitHub tokens', () => {
    log.error('sec', 'push failed with ghp_AbCdEf0123456789XyZaBcDeFgHiJkLmNo');
    expect(read()).not.toContain('AbCdEf0123456789');
  });

  it('masks fine-grained GitHub tokens', () => {
    log.error('sec', 'github_pat_11ABCDEFG0abcdefghijkl_MNOPQRSTUVWXYZ123456');
    expect(read()).not.toContain('MNOPQRSTUVWXYZ');
  });

  it('masks email addresses', () => {
    log.info('sec', 'signed in as someone@example.com');
    const text = read();
    expect(text).not.toContain('someone@example.com');
    expect(text).toContain('<email>');
  });

  it('masks cookie headers', () => {
    log.warn('sec', 'Cookie: SID=secretvalue123');
    expect(read()).not.toContain('secretvalue123');
  });

  it('masks tokens in query strings', () => {
    log.warn('sec', 'GET https://api.example.com/v1?access_token=supersecret&x=1');
    const text = read();
    expect(text).not.toContain('supersecret');
    expect(text).toContain('access_token=<redacted>');
  });

  it('replaces the home directory so logs do not leak a username', () => {
    log.info('sec', `saving to ${path.join(os.homedir(), 'Videos', 'clip.mp4')}`);
    expect(read()).not.toContain(os.homedir());
  });
});

describe('logger resilience', () => {
  it('handles values that cannot be stringified', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => log.info('circ', circular)).not.toThrow();
  });

  it('is safe to initialise twice', () => {
    expect(initLogger(dir, 'debug')).toBe(logPath);
  });
});
