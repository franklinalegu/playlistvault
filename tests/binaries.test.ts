import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setUserDataDir, getUserBinDir, resolveBinaries, clearBinaryCache } from '../backend/ffmpeg/binaries';

describe('binaries candidateDirs', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-bin-'));
    setUserDataDir(tmp);
    clearBinaryCache();
  });
  afterEach(() => {
    clearBinaryCache();
    setUserDataDir(path.join(os.tmpdir(), 'should-not-exist'));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('prefers userBinDir over PATH fallback', () => {
    const binDir = getUserBinDir();
    fs.mkdirSync(binDir, { recursive: true });
    const ext = process.platform === 'win32' ? '.exe' : '';
    const fake = path.join(binDir, `yt-dlp${ext}`);
    fs.writeFileSync(fake, 'fake');
    const bins = resolveBinaries();
    expect(bins.ytDlp).toBe(fake);
  });

  it('falls back to bare name when no file exists on disk', () => {
    const bins = resolveBinaries();
    // No file was created, so bare command names are returned.
    const expected = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    expect(bins.ytDlp).toBe(expected);
  });
});
